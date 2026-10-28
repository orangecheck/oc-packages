/**
 * `oc chat verify` — check an OC Chat artifact (oc-chat-protocol 0.4.0) from a shell.
 *
 *   oc chat verify event.json            a kind-30110 version, 30111 post or 30114 listing
 *   oc chat verify -                     the same, from stdin
 *   oc chat verify --channel <id>        resolve a channel's governance chain
 *   oc chat verify --handle <h>          who holds a handle (--channel-handle for channels)
 *
 * Online by default: it reads the relays, the device records, ochk.io's keys and
 * the chain. --offline runs only what needs no read, and says what it skipped.
 * Exit 0 verified, 1 failed, 2 could not be read (a read got no answer), 3 passed
 * the offline checks only, which is not verified.
 */

import { readFile } from 'node:fs/promises';

import { verifySignature } from '@orangecheck/bip322';
import {
    AUTH_HOST_JWKS_URL,
    authorizedCopy,
    CHANNEL_DESCRIPTOR_KIND,
    CHANNEL_POST_KIND,
    channelId,
    descriptorDtag,
    descriptorId,
    deviceDtag,
    isValidHandle,
    parseDescriptor,
    parsePost,
    policyRootedMatches,
    postDtag,
    postId,
    readChannelVersions,
    readVersionBinding,
    recordReads,
    resolveChannelChain,
    resolveDirectoryHandle,
    UnansweredReadError,
    verifyNostrEvent,
    verifyPost,
    versionDtag,
    type AuthHostKey,
    type DirectoryNamespace,
    type NostrEvent,
    type Query,
    type RecordLookup,
    type ResolvedChannel,
    type VerifyOnChain,
    type WalkDeps,
} from '@orangecheck/chat-core';
import { esploraWriteProofCheck } from '@orangecheck/chat-core/io';
import {
    channelDirectoryDtag,
    directoryDtag,
    esploraCoinReader,
    parseChannelDirectoryContent,
    parseDirectoryContent,
} from '@orangecheck/lock-core/directory';
import { queryEvents } from '@orangecheck/nostr-core';
import { mempoolHeaderSource } from '@orangecheck/stamp-ots';

import { die, readStdin } from '../util';

/** chat.ochk.io's relays. */
export const CHAT_RELAYS = ['wss://relay.ochk.io', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const ESPLORA = 'https://mempool.space/api';
const TIMEOUT_MS = 8000;

export interface ChatVerifyOpts {
    file?: string;
    channel?: string;
    founder?: string;
    handle?: string;
    channelHandle?: boolean;
    relays?: string;
    esplora?: string;
    offline?: boolean;
    json?: boolean;
}

/** Everything `oc chat verify` reads from the network. Tests pass their own. */
export interface ChatNet {
    query: Query;
    records: RecordLookup;
    hostKeys(): Promise<readonly AuthHostKey[]>;
    tip(): Promise<number>;
    verifyOnChain: VerifyOnChain;
    walk: Omit<WalkDeps, 'boundKeys' | 'verifyEvent'>;
    /** How the relays answered this run, when the network can tell. */
    relays?: () => RelayReport;
}

export interface Check {
    check: string;
    ok: boolean;
    detail?: string;
    /** The answer rests on something not being on the relays (no revocation, no
     *  newer version, no earlier claim), so a relay that missed a read can change it. */
    absence?: true;
}

export interface Report {
    subject: string;
    checks: Check[];
    /** What this run did not check. Never empty under --offline. */
    not_checked: string[];
    verdict: 'verified' | 'failed' | 'unread' | 'passed-offline';
    detail?: Record<string, unknown>;
    /** How the relays answered, for an online run. */
    relays?: RelayReport;
}

const verifyBip322 = ({ address, message, signature }: { address: string; message: string; signature: string }) => {
    try {
        return verifySignature(address, message, signature.trim());
    } catch {
        return false;
    }
};

/** One REQ to some relays: the events, and per relay whether it finished answering (EOSE). */
export type RawQuery = (
    filter: Record<string, unknown>,
    relays: readonly string[]
) => Promise<{ events: NostrEvent[]; relayStatus: readonly { relay: string; eose: boolean }[] }>;

/** How the relays answered over one run: how many there were, and which missed a read. */
export interface RelayReport {
    asked: number;
    answered: number;
    reads: number;
    silent: { relay: string; missed: number }[];
}

/** Counts, per relay, the reads it did not finish answering. */
export function relayTally() {
    const missed = new Map<string, number>();
    let reads = 0;
    return {
        note(status: readonly { relay: string; eose: boolean }[]) {
            reads++;
            for (const s of status) missed.set(s.relay, (missed.get(s.relay) ?? 0) + (s.eose ? 0 : 1));
        },
        report(): RelayReport {
            const silent = [...missed].filter(([, n]) => n > 0).map(([relay, n]) => ({ relay, missed: n }));
            return { asked: missed.size, answered: missed.size - silent.length, reads, silent };
        },
    };
}

const rawQuery: RawQuery = async (filter, relays) => queryEvents(filter as never, relays, TIMEOUT_MS);

export function liveNet(relays: readonly string[], esplora = ESPLORA, raw: RawQuery = rawQuery): ChatNet {
    const timed: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const tally = relayTally();
    const ask: RawQuery = async (filter, to) => {
        const res = await raw(filter, to);
        tally.note(res.relayStatus);
        return res;
    };
    const query: Query = async (filter) => ask(filter, relays);
    let keys: Promise<AuthHostKey[]> | null = null;
    return {
        query,
        // A bind any answering relay holds counts; "not bound" needs them all (chat-core recordReads).
        records: async (principal) => {
            const res = await ask({ kinds: [30078], '#d': [deviceDtag(principal)] }, relays);
            return {
                events: res.events,
                answered: res.relayStatus.some((r) => r.eose),
                complete: res.relayStatus.every((r) => r.eose),
            };
        },
        relays: () => tally.report(),
        // A JWKS that answers with no keys binds nothing; one that does not answer is not read.
        hostKeys: () =>
            (keys ??= (async () => {
                const unread = new UnansweredReadError("ochk.io's keys could not be read");
                let j: { keys?: AuthHostKey[] };
                try {
                    const res = await timed(AUTH_HOST_JWKS_URL);
                    if (!res.ok) throw unread;
                    j = (await res.json()) as { keys?: AuthHostKey[] };
                } catch {
                    throw unread;
                }
                return Array.isArray(j.keys) ? j.keys : [];
            })()),
        tip: async () => {
            const unread = new UnansweredReadError('the chain tip could not be read');
            let n: number;
            try {
                const res = await timed(`${esplora}/blocks/tip/height`);
                if (!res.ok) throw unread;
                n = Number.parseInt((await res.text()).trim(), 10);
            } catch {
                throw unread;
            }
            if (!Number.isFinite(n)) throw unread;
            return n;
        },
        verifyOnChain: esploraWriteProofCheck({ baseUrl: esplora, fetch: timed, unanswered: 'throw' }),
        walk: {
            page: async (relay, filter) => {
                const res = await ask(filter, [relay]);
                return { events: res.events, complete: res.relayStatus.some((r) => r.eose) };
            },
            tip: async () => {
                const res = await timed(`${esplora}/blocks/tip/height`);
                const n = Number.parseInt((await res.text()).trim(), 10);
                if (!res.ok || !Number.isFinite(n)) throw new Error('tip');
                return n;
            },
            headers: mempoolHeaderSource({ baseUrl: esplora, fetch: timed }),
            coin: esploraCoinReader({ baseUrl: esplora, fetch: timed, timeoutMs: TIMEOUT_MS }),
        },
    };
}

/** What --offline leaves out, by what the subject would have needed. */
const SKIPPED = {
    relays: 'relays: no device record, revocation or other version was read',
    hostKeys: "ochk.io's keys: a did:oc session binding was not verified",
    chain: 'the chain: no tip, coin or block header was read',
    utxo: 'the utxo floor: a write proof was not matched to an unspent coin',
};

function report(subject: string, checks: Check[], notChecked: string[], extra?: Record<string, unknown>): Report {
    const failed = checks.some((c) => !c.ok);
    return {
        subject,
        checks,
        not_checked: notChecked,
        verdict: failed ? 'failed' : notChecked.length > 0 ? 'passed-offline' : 'verified',
        ...(extra ? { detail: extra } : {}),
    };
}

const reads = (net: ChatNet) =>
    recordReads(net.records, { hostKeys: net.hostKeys, verifyBip322 });

/** Resolve a channel from what the relays hold, plus `given` when the caller holds an event of it. */
async function resolveChannel(cid: string, net: ChatNet, founder?: string, given?: NostrEvent) {
    const r = reads(net);
    const read = await readChannelVersions(cid, { query: net.query, everBoundKeys: r.everBoundKeys }, founder);
    const events = given && !read.events.some((e) => e.id === given.id) ? [...read.events, given] : read.events;
    const resolved = await resolveChannelChain(events, cid, {
        isBound: r.isBound,
        liveness: r.liveness,
        hostKeys: net.hostKeys,
        verifyBip322,
    });
    return { resolved, read };
}

function chainDetail(c: ResolvedChannel | null) {
    return c
        ? {
              tip: c.descriptorId,
              epochs: c.epochs,
              status: c.descriptor.status ?? 'active',
              founder: c.descriptor.founder_address,
              write_policy: c.descriptor.write.policy,
              rooted: c.descriptor.write.rooted,
          }
        : null;
}

/** A kind-30110 version. */
async function verifyVersion(ev: NostrEvent, net: ChatNet | null, founder?: string): Promise<Report> {
    const checks: Check[] = [];
    const c = parseDescriptor(ev);
    checks.push({ check: 'the event id and Schnorr signature hold (NIP-01)', ok: verifyNostrEvent(ev) });
    if (!c) return report('channel version', [...checks, { check: 'the content is a channel descriptor', ok: false }], []);
    const did = descriptorId(c);
    checks.push({ check: 'channel_id derives from founder_address and slug', ok: channelId(c.founder_address, c.slug) === c.channel_id });
    checks.push({ check: 'write.rooted matches write.policy', ok: policyRootedMatches(c.write) });
    const d = ev.tags.find((t) => t[0] === 'd')?.[1];
    const bindingTag = ev.tags.find((t) => t[0] === 'binding')?.[1];
    const hasBinding = bindingTag !== undefined;
    // A version from before 0.3.0 sits at the channel's legacy coordinate, which readers still fetch.
    const legacy = !hasBinding && d === descriptorDtag(c.channel_id);
    checks.push({
        check: "the d-tag is the version's own coordinate",
        ok: d === versionDtag(did) || legacy,
        ...(legacy ? { detail: 'the legacy coordinate, before 0.3.0' } : {}),
    });
    let session = false;
    try {
        session = hasBinding && (JSON.parse(bindingTag) as NostrEvent).tags.some((t) => t[0] === 'auth' && t[1] === 'session');
    } catch {
        /* readVersionBinding refuses it below */
    }
    const notChecked: string[] = [];
    if (hasBinding && (net || !session)) {
        const b = await readVersionBinding(ev, { hostKeys: net ? net.hostKeys : async () => [], verifyBip322 });
        checks.push({
            check: 'the binding tag binds the signing key to a principal',
            ok: b !== null,
            ...(b ? { detail: `${b.kind} ${b.principal}` } : {}),
        });
    } else if (hasBinding) {
        notChecked.push(SKIPPED.hostKeys);
    } else {
        notChecked.push('binding: the version carries no binding tag (published before 0.3.0); its key is bound only by records on the relays');
    }
    if (!net) return report('channel version', checks, [...notChecked, SKIPPED.relays]);
    // Failed on what the event itself shows: no relay read can change that.
    if (checks.some((c) => !c.ok)) return report('channel version', checks, [], { descriptor_id: did });
    // The event is judged by the rules with what the relays hold: authorship rests on
    // its binding (§8.3.1), not on a relay keeping it, so one the relays lack can stand.
    const { resolved, read } = await resolveChannel(c.channel_id, net, founder, ev);
    // This event, not just its content: the same content under another key is
    // another event, and the descriptor id does not tell them apart.
    const standing = authorizedCopy(resolved, ev);
    checks.push({ check: 'the channel resolves from what the relays hold and this event', ok: resolved !== null, absence: true });
    checks.push({ check: 'this event is an authorized copy of a version (§8.3.1)', ok: standing !== null, absence: true });
    return report('channel version', checks, notChecked.filter((n) => !n.startsWith('binding')), {
        descriptor_id: did,
        on_relays: read.events.some((e) => e.id === ev.id),
        on_resolved_chain: standing?.onChain ?? false,
        is_tip: standing?.isTip ?? false,
        channel: chainDetail(resolved),
    });
}

/** A kind-30111 post. */
async function verifyChannelPost(ev: NostrEvent, net: ChatNet | null): Promise<Report> {
    const checks: Check[] = [];
    const p = parsePost(ev);
    checks.push({ check: 'the event id and Schnorr signature hold (NIP-01)', ok: verifyNostrEvent(ev) });
    if (!p) return report('channel post', [...checks, { check: 'the content is a chat-channel post', ok: false }], []);
    const pid = postId(p);
    checks.push({ check: 'the event is signed by author_inbox_pubkey', ok: ev.pubkey === p.author_inbox_pubkey });
    checks.push({ check: 'the d-tag is the post coordinate', ok: ev.tags.find((t) => t[0] === 'd')?.[1] === postDtag(p.channel_id, pid) });
    if (net && checks.some((c) => !c.ok)) return report('channel post', checks, [], { post_id: pid });
    if (!net) {
        const skipped = [SKIPPED.relays, 'the write gate: the channel was not resolved, so its policy was not applied'];
        if (p.write_proof) skipped.push(SKIPPED.utxo, SKIPPED.chain);
        return report('channel post', checks, skipped, { post_id: pid });
    }
    const { resolved } = await resolveChannel(p.channel_id, net);
    checks.push({ check: 'the channel resolves from what the relays hold', ok: resolved !== null, absence: true });
    if (!resolved) return report('channel post', checks, [], { post_id: pid });
    const r = reads(net);
    const controlSig = ev.tags.find((t) => t[0] === 'control_sig')?.[1];
    const v = await verifyPost(p, resolved.descriptor, {
        event: ev,
        tipHeight: p.write_proof ? await net.tip() : 0,
        isBound: r.isBound,
        verifyBip322,
        verifyOnChain: net.verifyOnChain,
        ...(controlSig ? { controlSig } : {}),
    });
    checks.push({
        check: 'authorship and the write gate (§8.3.2, §8.3.3)',
        ok: v.ok,
        absence: true,
        ...(v.ok ? { detail: v.isTombstone ? `removal by ${v.role}` : v.role } : { detail: v.error }),
    });
    return report('channel post', checks, [], { post_id: pid, channel: chainDetail(resolved) });
}

/** Who holds a handle, and whether `ev` (if given) is the holder's listing. */
async function verifyHandle(handle: string, ns: DirectoryNamespace, net: ChatNet | null, ev?: NostrEvent): Promise<Report> {
    const checks: Check[] = [];
    const subject = ns === 'people' ? 'directory listing' : 'channel listing';
    checks.push({ check: 'the handle is 3 to 32 of a-z, 0-9 and _', ok: isValidHandle(handle.toLowerCase()) });
    if (ev) {
        checks.push({ check: 'the event id and Schnorr signature hold (NIP-01)', ok: verifyNostrEvent(ev) });
        const d = ns === 'people' ? directoryDtag(handle) : channelDirectoryDtag(handle);
        checks.push({ check: 'the d-tag is the salted handle hash', ok: ev.tags.find((t) => t[0] === 'd')?.[1] === d });
        let content: unknown = null;
        try {
            content = JSON.parse(ev.content);
        } catch {
            /* not JSON */
        }
        const parsed = ns === 'people' ? parseDirectoryContent(content, handle) : parseChannelDirectoryContent(content, handle);
        checks.push({ check: 'the content is a v2 listing or tombstone (§8.2.5 (1))', ok: parsed !== null });
    }
    if (!net) return report(subject, checks, [SKIPPED.relays, SKIPPED.chain, 'the claim: its anchor, coin and order were not read']);
    if (checks.some((c) => !c.ok)) return report(subject, checks, []);
    const r = reads(net);
    const answer = await resolveDirectoryHandle(handle.toLowerCase(), ns, {
        ...net.walk,
        boundKeys: (a) => r.boundKeys(a),
        verifyEvent: verifyNostrEvent,
    });
    if (answer.result === 'E_DIR_UNRESOLVED') throw new UnansweredReadError('the directory read could not settle the handle');
    const holds = answer.result === 'holds';
    if (ev) {
        checks.push({
            check: 'this listing is the holder’s state',
            ok: holds && answer.listing.event.id === ev.id,
            absence: true,
            ...(holds ? { detail: answer.holder } : { detail: answer.result }),
        });
    } else {
        checks.push({ check: 'a claim holds the handle', ok: holds, detail: holds ? answer.holder : answer.result, absence: true });
    }
    return report(
        subject,
        checks,
        [],
        holds ? { holder: answer.holder, claim_id: answer.claimId, anchor: answer.anchor, coin: answer.coin, tip: answer.tip } : { result: answer.result }
    );
}

/** One artifact, by its kind. */
export async function verifyChat(opts: ChatVerifyOpts, input: unknown, net: ChatNet | null): Promise<Report> {
    if (opts.channel) {
        if (!net) die('--channel reads the relays; it has no offline form');
        const { resolved } = await resolveChannel(opts.channel, net, opts.founder);
        return report('channel', [{ check: 'the channel resolves from what the relays hold', ok: resolved !== null, absence: true }], [], { channel: chainDetail(resolved) });
    }
    if (opts.handle) return verifyHandle(opts.handle, opts.channelHandle ? 'channel' : 'people', net);
    const ev = input as NostrEvent;
    if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'number' || !Array.isArray(ev.tags)) {
        die('input is not a Nostr event');
    }
    if (ev.kind === CHANNEL_DESCRIPTOR_KIND) return verifyVersion(ev, net, opts.founder);
    if (ev.kind === CHANNEL_POST_KIND) return verifyChannelPost(ev, net);
    if (ev.kind === 30114) {
        let handle = '';
        try {
            handle = String((JSON.parse(ev.content) as { handle?: unknown }).handle ?? '');
        } catch {
            /* checked below */
        }
        const ns: DirectoryNamespace = ev.tags.some((t) => t[0] === 'd' && t[1]?.startsWith('oc-lock-chat-chdir:')) ? 'channel' : 'people';
        return verifyHandle(handle, ns, net, ev);
    }
    die(`kind ${ev.kind} is not an OC Chat artifact this command verifies (30110, 30111, 30114)`);
}

export function render(r: Report): string {
    const lines = [`${r.subject}:`];
    for (const c of r.checks) lines.push(`  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.check}${c.detail ? ` (${c.detail})` : ''}`);
    for (const n of r.not_checked) lines.push(`  not checked  ${n}`);
    if (r.detail) for (const [k, v] of Object.entries(r.detail)) lines.push(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    const answered = r.relays ? ` (${r.relays.answered} of ${r.relays.asked} relays answered every read)` : '';
    const verdict = {
        verified: `VERIFIED${answered}`,
        failed: 'FAILED',
        unread: 'NOT READ: a read got no answer, so nothing is concluded',
        'passed-offline': 'PASSED OFFLINE CHECKS ONLY: not verified (see "not checked")',
    }[r.verdict];
    lines.push(verdict);
    return lines.join('\n');
}

/** Detail keys computed from the event alone, which no relay read changes. */
const EVENT_OWN = new Set(['descriptor_id', 'post_id']);

export async function runChatVerify(opts: ChatVerifyOpts, net?: ChatNet | null): Promise<void> {
    let input: unknown = null;
    if (!opts.channel && !opts.handle) {
        const raw = !opts.file || opts.file === '-' ? await readStdin() : await readFile(opts.file, 'utf8');
        if (!raw.trim()) die('give an event file, - for stdin, --channel or --handle');
        try {
            input = JSON.parse(raw);
        } catch {
            die('input is not JSON');
        }
    }
    const relays = opts.relays ? opts.relays.split(',').map((s) => s.trim()).filter(Boolean) : CHAT_RELAYS;
    if (!opts.offline && net === undefined && typeof (globalThis as { WebSocket?: unknown }).WebSocket !== 'function') {
        die('reading the relays needs a WebSocket global (Node 22 or later); run with --offline, or upgrade Node');
    }
    const n = opts.offline ? null : (net ?? liveNet(relays, opts.esplora ?? ESPLORA));
    let r: Report;
    try {
        r = await verifyChat(opts, input, n);
    } catch (e) {
        if (!(e instanceof UnansweredReadError)) throw e;
        r = { subject: 'read', checks: [], not_checked: [e.message], verdict: 'unread' };
    }
    // Name each relay that missed a read: a revocation, a newer version or a record
    // only it holds was not seen. A verdict that rests on such an absence is then not
    // read (until a relay floor is decided): VERIFIED never stands on a missed read.
    // FAILED stands only when a check that rests on no absence failed (the event's own
    // id, signature, coordinate or binding). A failed check marked `absence` turns
    // NOT READ too, even when a revocation the answering relay holds failed it: the
    // check does not tell a seen revocation from a record not read.
    const tally = n?.relays?.();
    if (tally && tally.asked > 0) {
        r.relays = tally;
        for (const s of tally.silent) {
            r.not_checked.push(
                `relay ${s.relay} did not answer ${s.missed} of ${tally.reads} reads: a revocation, newer version or record only it holds was not seen`
            );
        }
        const failed = r.checks.filter((c) => !c.ok);
        const restsOnAbsence =
            r.verdict === 'verified' || (r.verdict === 'failed' && failed.every((c) => c.absence));
        if (tally.silent.length > 0 && restsOnAbsence) {
            r.verdict = 'unread';
            // What the relays were read for rests on the missed read too; only the
            // event's own ids are known.
            if (r.detail) for (const k of Object.keys(r.detail)) if (!EVENT_OWN.has(k)) r.detail[k] = 'unknown';
        }
    }
    process.stdout.write((opts.json ? JSON.stringify(r, null, 2) : render(r)) + '\n');
    process.exit({ verified: 0, failed: 1, unread: 2, 'passed-offline': 3 }[r.verdict]);
}
