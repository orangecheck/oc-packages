// `oc-vote create`, `vote`, `reveal` and `republish` end to end, over relays on
// 127.0.0.1 that say OK to every EVENT and keep it, keep nothing, or keep a
// forged copy. Real WebSockets, real Nostr signatures, BIP-322 polls, ballots and
// reveals, and OC Stamps; the wallet is a stand-in that signs with throwaway
// keys. Nothing leaves 127.0.0.1.
//
// A poll, ballot, reveal or ballot stamp is in only once min(2, asked) relays,
// each asked alone, serve a valid copy back. Below that the command says so,
// exits 2, and gives the signed event, which `republish` sends again as it is.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { closeRelayPool } from '@orangecheck/nostr-core';
import { hexEncode, generateX25519KeyPair } from '@orangecheck/lock-crypto';
import type { StampEnvelope } from '@orangecheck/stamp-core';
import {
    ANCHOR_FINAL_CONFIRMATIONS,
    ballotId,
    lastAnchorHeight,
    pollId,
    revealId,
    type Ballot,
    type Poll,
    type Reveal,
} from '@orangecheck/vote-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import { buildBallotEvent, buildPollEvent, buildRevealEvent, buildStampEvent } from './events.js';
import type { NostrEvent } from './nostr.js';

const kCreator = '11'.repeat(32);
const kVoter = '22'.repeat(32);
const kStranger = '33'.repeat(32);
const CREATOR = addressFromPrivateKey(kCreator, 'p2wpkh');
const VOTER = addressFromPrivateKey(kVoter, 'p2wpkh');
const STRANGER = addressFromPrivateKey(kStranger, 'p2wpkh');

// The wallet: signs what it is shown with that address's throwaway key, and counts.
const wallet = vi.hoisted(() => ({ signs: 0, keys: {} as Record<string, string> }));
vi.mock('./sig.js', () => ({
    promptForSignature: async (address: string, id: string) => {
        wallet.signs++;
        return signMessage(address, id, wallet.keys[address]!);
    },
}));
wallet.keys[CREATOR] = kCreator;
wallet.keys[VOTER] = kVoter;

// An anchored poll's ballot is stamped by the voter's client. No calendar is
// reached: the stamp is counted, and either fails or is made without a proof.
const stamping = vi.hoisted(() => ({ calls: 0, make: false }));
vi.mock('./anchors.js', async (actual) => {
    const real = await actual<typeof import('./anchors.js')>();
    const { stamp } = await import('@orangecheck/stamp-core');
    const { ballotStampContent } = await import('@orangecheck/vote-core');
    const bip322 = await import('@orangecheck/bip322');
    return {
        ...real,
        stampBallot: async (ballot: Ballot) => {
            stamping.calls++;
            if (!stamping.make) throw new Error('no calendar here');
            const key = '77'.repeat(32);
            const address = bip322.addressFromPrivateKey(key, 'p2wpkh');
            const c = ballotStampContent(ballot);
            return stamp({
                content: { hash: c.hash, length: c.length },
                mime: c.mime,
                signer: { address, signMessage: async (m: string) => bip322.signMessage(address, m, key) },
            });
        },
    };
});

// The chain an anchored poll's reveal is checked against: the block at the
// deadline and the tip, set per test; mempool.space is never asked.
const chainState = vi.hoisted(() => ({ height: 900_000, tip: 900_000 }));
vi.mock('@orangecheck/vote-core', async (actual) => ({
    ...(await actual<typeof import('@orangecheck/vote-core')>()),
    resolveCloseBlock: async () => ({ ok: true as const, height: chainState.height, tip: chainState.tip }),
}));

import { runCreate } from './commands/create.js';
import { runReveal } from './commands/reveal.js';
import { runVote } from './commands/vote.js';

// Clock-dated (before the 2026-11-15 cutover), so no stamp is made.
const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: CREATOR,
    question: 'Ship it?',
    options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
    ],
    deadline: '2026-11-10T00:00:00Z',
    snapshot_block: 'deadline',
    weight_mode: 'one_per_address',
    weight_params: null,
    min_sats: 0,
    min_days: 0,
    mode: 'public',
    reveal_pk: null,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-11-01T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
poll.sig.value = signMessage(CREATOR, pollId(poll), kCreator);
const pid = pollId(poll);
const pollEvent = buildPollEvent(poll);

/** What a relay does with an event it is sent; it says OK either way. */
type Mode = 'keep' | 'drop' | 'junk-sig' | 'bad-nostr';

interface Relay {
    url: string;
    mode: Mode;
    /** For stamps (kind 30083), when it differs from `mode`. */
    stampMode?: Mode;
    store: NostrEvent[];
    received: NostrEvent[];
}

/** The object in `ev` signed by someone else, under the same id, in a fresh event. */
function junkSig(ev: NostrEvent): NostrEvent {
    const o = JSON.parse(ev.content);
    const by = (id: string) => signMessage(STRANGER, id, kStranger);
    if (ev.kind === 30080) return buildPollEvent({ ...o, sig: { ...o.sig, value: by(pollId(o)) } });
    if (ev.kind === 30081) {
        const junk = { ...o, sig: { ...o.sig, value: by(ballotId(o)) } };
        expect(ballotId(junk)).toBe(ballotId(o));
        return buildBallotEvent(junk);
    }
    if (ev.kind === 30082) return buildRevealEvent({ ...o, sig: { ...o.sig, value: by(revealId(o)) } });
    const env = o as StampEnvelope;
    return buildStampEvent({ ...env, sig: { ...env.sig, value: by(env.id) } });
}

/** `ev` with its Nostr signature broken: id and content unchanged. */
function badNostr(ev: NostrEvent): NostrEvent {
    const last = ev.sig.slice(-1) === '0' ? '1' : '0';
    return { ...ev, sig: ev.sig.slice(0, -1) + last };
}

function matches(e: NostrEvent, f: Record<string, unknown>): boolean {
    if (Array.isArray(f.kinds) && !f.kinds.includes(e.kind)) return false;
    if (typeof f.until === 'number' && e.created_at > f.until) return false;
    for (const [k, v] of Object.entries(f)) {
        if (!k.startsWith('#') || !Array.isArray(v)) continue;
        if (!e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1]))) return false;
    }
    return true;
}

const closers: Array<() => Promise<void>> = [];

/** A relay at 127.0.0.1 holding `polls`, answering like strfry, doing `mode` with what it is sent. */
async function relay(mode: Mode, polls: NostrEvent[] = [pollEvent]): Promise<Relay> {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((r) => wss.once('listening', r));
    const r: Relay = { url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, mode, store: [...polls], received: [] };
    wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
            const msg = JSON.parse(String(raw)) as unknown[];
            if (msg[0] === 'EVENT') {
                const ev = msg[1] as NostrEvent;
                r.received.push(ev);
                const mode = ev.kind === 30083 ? (r.stampMode ?? r.mode) : r.mode;
                if (mode === 'keep') r.store.push(ev);
                if (mode === 'junk-sig') r.store.push(junkSig(ev));
                if (mode === 'bad-nostr') r.store.push(badNostr(ev));
                ws.send(JSON.stringify(['OK', ev.id, true, '']));
                return;
            }
            if (msg[0] !== 'REQ') return;
            const [, sub, ...filters] = msg as [string, string, ...Record<string, unknown>[]];
            for (const f of filters) {
                const cap = typeof f.limit === 'number' ? f.limit : 500;
                r.store
                    .filter((e) => matches(e, f))
                    .sort((a, b) => b.created_at - a.created_at)
                    .slice(0, cap)
                    .forEach((e) => ws.send(JSON.stringify(['EVENT', sub, e])));
            }
            ws.send(JSON.stringify(['EOSE', sub]));
        });
    });
    closers.push(
        () =>
            new Promise<void>((done) => {
                for (const c of wss.clients) c.terminate();
                wss.close(() => done());
            })
    );
    return r;
}

const outside: string[] = [];
let dir = '';

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oc-vote-cast-'));
    // Anything that would leave 127.0.0.1 is recorded, and fails the run below.
    const NativeWebSocket = globalThis.WebSocket;
    vi.stubGlobal(
        'WebSocket',
        class extends NativeWebSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                if (!String(url).startsWith('ws://127.0.0.1:')) outside.push(String(url));
                super(url, protocols);
            }
        }
    );
});

afterEach(async () => {
    process.exitCode = undefined;
    wallet.signs = 0;
    stamping.calls = 0;
    stamping.make = false;
    vi.restoreAllMocks();
    closeRelayPool();
    await Promise.all(closers.splice(0).map((c) => c()));
});

afterAll(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    expect(outside).toEqual([]);
});

/** Runs `run`, returning what it wrote to stdout and the exit status it set. */
async function captured(run: () => Promise<void>): Promise<{ out: string; exit: number }> {
    const chunks: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((s: string | Uint8Array) => (chunks.push(String(s)), true));
    process.exitCode = undefined;
    try {
        await run();
        return { out: chunks.join(''), exit: Number(process.exitCode ?? 0) };
    } finally {
        process.exitCode = undefined;
        write.mockRestore();
    }
}

const vote = (rs: Relay[], json = true) =>
    captured(() => runVote({ pollId: pid, voter: VOTER, option: 'yes', relays: rs.map((r) => r.url), json }));

const republish = async (rs: Relay[], file: string, json = true) => {
    const { runRepublish } = await import('./commands/republish.js');
    return captured(() => runRepublish({ file, relays: rs.map((r) => r.url), json }));
};

describe('oc-vote vote', () => {
    it('is in only once 2 relays serve it back, though all 5 say OK; below that it exits 2', async () => {
        for (const n of [0, 1, 2]) {
            const rs = await Promise.all([0, 1, 2, 3, 4].map((i) => relay(i < n ? 'keep' : 'drop')));
            const { out, exit } = await vote(rs);
            const got = JSON.parse(out);
            expect(rs.every((r) => r.received.some((e) => e.kind === 30081))).toBe(true);
            expect(got.in).toBe(n >= 2);
            expect(got.served_by).toEqual(rs.slice(0, n).map((r) => r.url));
            expect([got.asked, got.quorum]).toEqual([5, 2]);
            expect(got.event.id).toBe(rs[0]!.received.find((e) => e.kind === 30081)!.id);
            expect(got).not.toHaveProperty('published');
            expect(exit).toBe(n >= 2 ? 0 : 2);
            closeRelayPool();
            await Promise.all(closers.splice(0).map((c) => c()));
        }
    });

    it('says plainly what the read-back showed, and how to send the same signed ballot again', async () => {
        const one = await Promise.all(['keep', 'drop', 'drop', 'drop', 'drop'].map((m) => relay(m as Mode)));
        const notIn = await vote(one, false);
        expect(notIn.exit).toBe(2);
        expect(notIn.out).toContain(
            'in:         not yet: only 1 of 5 relays serves it back, and a count is sure to see it only once 2 do'
        );
        expect(notIn.out).toContain(`✓ ${one[0]!.url}`);
        expect(notIn.out).toContain(`✗ ${one[1]!.url}`);
        expect(notIn.out).toContain('oc-vote republish <file>');
        const line = /^ {2}event: {6}(.+)$/m.exec(notIn.out)?.[1];
        expect(JSON.parse(line!).id).toBe(one[0]!.received.find((e) => e.kind === 30081)!.id);
        expect(notIn.out).not.toMatch(/published|\bcast\b|counted/);

        const two = await Promise.all(['keep', 'keep', 'drop', 'drop', 'drop'].map((m) => relay(m as Mode)));
        const isIn = await vote(two, false);
        expect(isIn.exit).toBe(0);
        expect(isIn.out).toContain('in:         yes, 2 of 5 relays serve it back');
        expect(isIn.out).not.toContain('republish');
    });

    it('does not count a copy under the ballot’s id with a junk signature, or one whose Nostr signature fails', async () => {
        const rs = await Promise.all(['keep', 'junk-sig', 'bad-nostr', 'drop', 'drop'].map((m) => relay(m as Mode)));
        const { out, exit } = await vote(rs);
        const got = JSON.parse(out);
        // B and C do serve a copy under the ballot's id; neither holds.
        expect(rs[1]!.store.some((e) => e.kind === 30081 && JSON.parse(e.content).voter === VOTER)).toBe(true);
        expect(rs[2]!.store.some((e) => e.id === got.event.id && e.sig !== got.event.sig)).toBe(true);
        expect(got.served_by).toEqual([rs[0]!.url]);
        expect(got.in).toBe(false);
        expect(exit).toBe(2);
    });
    it('stamps an anchored poll’s ballot only once a relay serves it back, not on OKs', async () => {
        // Anchored: the deadline is on or after the 2026-11-15 cutover.
        const anchored: Poll = { ...poll, question: 'Anchored?', deadline: '2026-12-01T00:00:00Z', sig: { ...poll.sig } };
        anchored.sig.value = signMessage(CREATOR, pollId(anchored), kCreator);
        const apid = pollId(anchored);
        const voteOn = (rs: Relay[]) =>
            captured(() => runVote({ pollId: apid, voter: VOTER, option: 'yes', relays: rs.map((r) => r.url), json: true }));

        const none = await Promise.all([0, 1, 2, 3, 4].map(() => relay('drop', [buildPollEvent(anchored)])));
        const unserved = JSON.parse((await voteOn(none)).out);
        expect(unserved.served_by).toEqual([]);
        expect(stamping.calls).toBe(0);
        expect(unserved).not.toHaveProperty('stamp');

        const one = await Promise.all(['keep', 'drop', 'drop', 'drop', 'drop'].map((m) => relay(m as Mode, [buildPollEvent(anchored)])));
        const served = JSON.parse((await voteOn(one)).out);
        expect(served.served_by).toEqual([one[0]!.url]);
        expect(stamping.calls).toBe(1);
        expect(served.stamp).toEqual({ error: 'no calendar here' });
    });
});

describe('oc-vote republish', () => {
    it('sends the same signed event again, and tries on different relays add up while the earlier ones still serve it', async () => {
        const rs = await Promise.all(['keep', 'drop', 'drop', 'drop', 'drop'].map((m) => relay(m as Mode)));
        const first = await vote(rs);
        expect(first.exit).toBe(2);
        const file = join(dir, 'vote.json');
        writeFileSync(file, first.out);
        rs[1]!.mode = 'keep';
        const again = await republish(rs, file);
        const got = JSON.parse(again.out);
        expect(got.served_by).toEqual([rs[0]!.url, rs[1]!.url]);
        expect(got.in).toBe(true);
        expect(again.exit).toBe(0);
        // One event, sent as it was every time, and the wallet asked once.
        const sent = rs.flatMap((r) => r.received.filter((e) => e.kind === 30081));
        expect(new Set(sent.map((e) => JSON.stringify(e)))).toEqual(new Set([JSON.stringify(JSON.parse(first.out).event)]));
        expect(wallet.signs).toBe(1);
    });

    it('asks every relay again: one that has dropped the ballot no longer counts', async () => {
        const rs = await Promise.all(['keep', 'drop', 'drop', 'drop', 'drop'].map((m) => relay(m as Mode)));
        const first = await vote(rs);
        // The bare event line works as the file too.
        const file = join(dir, 'event.json');
        writeFileSync(file, JSON.stringify(JSON.parse(first.out).event));
        rs[0]!.store = [pollEvent];
        rs[0]!.mode = 'drop';
        rs[1]!.mode = 'keep';
        const again = await republish(rs, file, false);
        expect(again.exit).toBe(2);
        expect(again.out).toContain('only 1 of 5 relays serves it back');
        expect(again.out).toContain(`✓ ${rs[1]!.url}`);
        expect(again.out).toContain(`✗ ${rs[0]!.url}`);
        expect(again.out).toContain(`oc-vote republish ${file}`);
    });

    it('refuses an event whose ballot signature or Nostr signature does not hold, and sends nothing', async () => {
        const rs = await Promise.all(['keep', 'keep', 'keep', 'keep', 'keep'].map((m) => relay(m as Mode)));
        const b: Ballot = {
            v: 0,
            kind: 'oc-vote/ballot',
            poll_id: pid,
            voter: VOTER,
            option: 'yes',
            attestation_id: null,
            secret: null,
            created_at: '2026-11-01T12:00:00Z',
            sig: { alg: 'bip322', pubkey: VOTER, value: '' },
        };
        b.sig.value = signMessage(VOTER, ballotId(b), kVoter);
        const real = buildBallotEvent(b);
        const forged = join(dir, 'forged.json');
        writeFileSync(forged, JSON.stringify(junkSig(real)));
        await expect(republish(rs, forged)).rejects.toThrow(/ballot's signature doesn't verify/);
        const broken = join(dir, 'broken.json');
        writeFileSync(broken, JSON.stringify(badNostr(real)));
        await expect(republish(rs, broken)).rejects.toThrow(/id or signature doesn't hold/);
        expect(rs.flatMap((r) => r.received)).toEqual([]);
    });
});

/** Five relays doing `modes` with what they are sent, each holding `polls`. */
const five = (modes: Mode[], polls: NostrEvent[] = [pollEvent]) => Promise.all(modes.map((m) => relay(m, polls)));
const sent = (rs: Relay[], kind: number) => rs.flatMap((r) => r.received.filter((e) => e.kind === kind));

const create = (rs: Relay[], json = true) =>
    captured(() =>
        runCreate({
            creator: CREATOR,
            question: 'Merge it?',
            options: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' },
            ],
            deadline: '2026-11-10T00:00:00Z',
            snapshotBlock: 'deadline',
            weightMode: 'one_per_address',
            minSats: 0,
            minDays: 0,
            tiebreak: 'latest',
            mode: 'public',
            relays: rs.map((r) => r.url),
            json,
        })
    );

describe('oc-vote create', () => {
    it('publishes a poll only once 2 relays serve it back; below that it exits 2', async () => {
        for (const n of [0, 1, 2]) {
            const rs = await five([0, 1, 2, 3, 4].map((i) => (i < n ? 'keep' : 'drop')), []);
            const { out, exit } = await create(rs);
            const got = JSON.parse(out);
            expect(sent(rs, 30080)).toHaveLength(5);
            expect(got.in).toBe(n >= 2);
            expect(got.served_by).toEqual(rs.slice(0, n).map((r) => r.url));
            expect(got.event.kind).toBe(30080);
            expect(got).not.toHaveProperty('published');
            expect(exit).toBe(n >= 2 ? 0 : 2);
        }
    });

    it('does not count a copy under the poll id signed by someone else, or one whose Nostr signature fails', async () => {
        const rs = await five(['keep', 'junk-sig', 'bad-nostr', 'drop', 'drop'], []);
        const got = JSON.parse((await create(rs)).out);
        expect(rs[1]!.store.some((e) => e.kind === 30080 && pollId(JSON.parse(e.content)) === got.poll_id)).toBe(true);
        expect(rs[2]!.store.some((e) => e.id === got.event.id && e.sig !== got.event.sig)).toBe(true);
        expect(got.served_by).toEqual([rs[0]!.url]);
    });

    it('says plainly what the read-back showed; republish sends the same poll, so its id and ballots stay', async () => {
        const rs = await five(['keep', 'drop', 'drop', 'drop', 'drop'], []);
        const first = await create(rs, false);
        expect(first.exit).toBe(2);
        expect(first.out).toContain(
            'published:  not yet: only 1 of 5 relays serves it back, and it is sure to be found only once 2 do'
        );
        expect(first.out).toContain('it sends the same signed poll, with nothing new to sign');
        const line = /^ {2}event: {6}(.+)$/m.exec(first.out)![1]!;
        const id = /^ {2}poll_id: {4}([0-9a-f]{64})$/m.exec(first.out)![1]!;
        const file = join(dir, 'poll.json');
        writeFileSync(file, line);
        rs[1]!.mode = 'keep';
        const again = await republish(rs, file);
        const got = JSON.parse(again.out);
        expect([got.poll_id, got.in, again.exit]).toEqual([id, true, 0]);
        expect(got.served_by).toEqual([rs[0]!.url, rs[1]!.url]);
        expect(new Set(sent(rs, 30080).map((e) => e.id))).toEqual(new Set([JSON.parse(line).id]));
        expect(wallet.signs).toBe(1);

        const none = await create(await five(['drop', 'drop', 'drop', 'drop', 'drop'], []), false);
        expect(none.out).toContain('published:  not yet: no relay serves it back, so no one can find it');
    });
});

// A secret poll whose clock-dated deadline has passed, so its reveal counts now.
const keys = generateX25519KeyPair();
const secretPoll: Poll = {
    ...poll,
    question: 'Sealed?',
    deadline: '2026-10-21T00:00:00Z',
    mode: 'secret',
    reveal_pk: hexEncode(keys.public),
    sig: { ...poll.sig },
};
secretPoll.sig.value = signMessage(CREATOR, pollId(secretPoll), kCreator);
const spid = pollId(secretPoll);
const secretEvent = buildPollEvent(secretPoll);

const reveal = (rs: Relay[], json = true) =>
    captured(() =>
        runReveal({ pollId: spid, revealSk: hexEncode(keys.secret), creator: CREATOR, relays: rs.map((r) => r.url), json })
    );

describe('oc-vote reveal', () => {
    it('publishes a reveal only once 2 relays serve it back; below that it exits 2', async () => {
        for (const n of [0, 1, 2]) {
            const rs = await five([0, 1, 2, 3, 4].map((i) => (i < n ? 'keep' : 'drop')), [secretEvent]);
            const { out, exit } = await reveal(rs);
            const got = JSON.parse(out);
            expect(sent(rs, 30082)).toHaveLength(5);
            expect([got.in, exit]).toEqual([n >= 2, n >= 2 ? 0 : 2]);
            expect(got.served_by).toEqual(rs.slice(0, n).map((r) => r.url));
            expect(got).not.toHaveProperty('published');
        }
    });

    it('does not count a copy under the reveal id signed by someone else, or one whose Nostr signature fails', async () => {
        const rs = await five(['keep', 'junk-sig', 'bad-nostr', 'drop', 'drop'], [secretEvent]);
        const got = JSON.parse((await reveal(rs)).out);
        expect(rs[1]!.store.some((e) => e.kind === 30082 && revealId(JSON.parse(e.content)) === got.reveal_id)).toBe(true);
        expect(got.served_by).toEqual([rs[0]!.url]);
        expect(got.in).toBe(false);
    });

    it('run again, sends the reveal already signed, as it is, to the relays that lack it', async () => {
        const rs = await five(['keep', 'drop', 'drop', 'drop', 'drop'], [secretEvent]);
        const first = JSON.parse((await reveal(rs)).out);
        expect(first.in).toBe(false);
        rs[1]!.mode = 'keep';
        const again = await reveal(rs, false);
        expect(again.exit).toBe(0);
        expect(again.out).toContain('published:  yes, 2 of 5 relays serve it back');
        expect(again.out).toContain('signed earlier and found on the relays');
        expect(wallet.signs).toBe(1);
        expect(new Set(sent(rs, 30082).map((e) => e.id))).toEqual(new Set([first.event.id]));
        // Only the relays that did not serve it were sent it again.
        expect(rs[0]!.received.filter((e) => e.kind === 30082)).toHaveLength(1);
    });

    it('republish sends a saved reveal again, checked against its poll', async () => {
        const rs = await five(['keep', 'drop', 'drop', 'drop', 'drop'], [secretEvent]);
        const first = await reveal(rs);
        const file = join(dir, 'reveal.json');
        writeFileSync(file, first.out);
        rs[2]!.mode = 'keep';
        const again = await republish(rs, file);
        const got = JSON.parse(again.out);
        expect([got.in, again.exit]).toEqual([true, 0]);
        expect(got.served_by).toEqual([rs[0]!.url, rs[2]!.url]);
    });
});

describe('an anchored poll’s reveal', () => {
    // Anchored: the deadline is on or after the 2026-11-15 cutover. A count
    // accepts its reveal only from block H_close + G + 6 (SPEC §10.3).
    const sealed: Poll = { ...secretPoll, question: 'Anchored seal?', deadline: '2026-12-01T00:00:00Z', sig: { ...poll.sig } };
    sealed.sig.value = signMessage(CREATOR, pollId(sealed), kCreator);
    const sealedEvent = buildPollEvent(sealed);
    const acceptedFrom = lastAnchorHeight(chainState.height) + ANCHOR_FINAL_CONFIRMATIONS;
    const revealOn = (rs: Relay[], force = false) =>
        captured(() =>
            runReveal({
                pollId: pollId(sealed),
                revealSk: hexEncode(keys.secret),
                creator: CREATOR,
                relays: rs.map((r) => r.url),
                force,
                json: true,
            })
        );

    it('reads not in, and exits 2, while the chain is short of the block a count accepts it from', async () => {
        chainState.tip = acceptedFrom - 1;
        const rs = await five(['keep', 'keep', 'keep', 'keep', 'keep'], [sealedEvent]);
        const { out, exit } = await revealOn(rs, true);
        const got = JSON.parse(out);
        // Every relay holds it, and none serves a copy a count would accept yet.
        expect(rs.every((r) => r.store.some((e) => e.kind === 30082))).toBe(true);
        expect([got.in, got.served_by, exit]).toEqual([false, [], 2]);
    });

    it('reads in at 2 relays once the chain reaches that block', async () => {
        chainState.tip = acceptedFrom;
        const rs = await five(['keep', 'keep', 'drop', 'drop', 'drop'], [sealedEvent]);
        const { out, exit } = await revealOn(rs);
        const got = JSON.parse(out);
        expect([got.in, got.served_by, exit]).toEqual([true, [rs[0]!.url, rs[1]!.url], 0]);
    });
});

describe('oc-vote republish refuses', () => {
    it('a poll, reveal or stamp that does not verify, and sends nothing', async () => {
        const rs = await five(['keep', 'keep', 'keep', 'keep', 'keep'], [secretEvent]);
        const forged = async (name: string, ev: NostrEvent) => {
            const file = join(dir, name);
            writeFileSync(file, JSON.stringify(junkSig(ev)));
            return republish(rs, file);
        };
        await expect(forged('poll.json', secretEvent)).rejects.toThrow(/poll's signature doesn't verify/);
        const r: Reveal = {
            v: 0,
            kind: 'oc-vote/reveal',
            poll_id: spid,
            reveal_sk: hexEncode(keys.secret),
            revealed_at: '2026-10-22T00:00:00Z',
            sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
        };
        r.sig.value = signMessage(CREATOR, revealId(r), kCreator);
        await expect(forged('reveal.json', buildRevealEvent(r))).rejects.toThrow(/reveal doesn't verify against its poll/);
        stamping.make = true;
        const { stampBallot } = await import('./anchors.js');
        const b: Ballot = {
            v: 0,
            kind: 'oc-vote/ballot',
            poll_id: spid,
            voter: VOTER,
            option: null,
            attestation_id: null,
            secret: null,
            created_at: '2026-10-20T00:00:00Z',
            sig: { alg: 'bip322', pubkey: VOTER, value: '' },
        };
        b.sig.value = signMessage(VOTER, ballotId(b), kVoter);
        const real = await stampBallot(b);
        await expect(forged('stamp.json', buildStampEvent(real))).rejects.toThrow(/stamp's signature doesn't verify/);
        expect(rs.flatMap((x) => x.received)).toEqual([]);
    });
});

describe('an anchored poll’s ballot stamp', () => {
    const anchored: Poll = { ...poll, question: 'Anchored stamp?', deadline: '2026-12-01T00:00:00Z', sig: { ...poll.sig } };
    anchored.sig.value = signMessage(CREATOR, pollId(anchored), kCreator);
    const apid = pollId(anchored);
    const anchoredEvent = buildPollEvent(anchored);
    const voteOn = (rs: Relay[], json = true) =>
        captured(() => runVote({ pollId: apid, voter: VOTER, option: 'yes', relays: rs.map((r) => r.url), json }));

    it('is read back like the ballot: below 2 relays the command exits 2, though the ballot is in', async () => {
        stamping.make = true;
        const rs = await five(['keep', 'keep', 'drop', 'drop', 'drop'], [anchoredEvent]);
        rs[1]!.stampMode = 'drop';
        const { out, exit } = await voteOn(rs, false);
        expect(exit).toBe(2);
        expect(out).toContain('in:         yes, 2 of 5 relays serve it back');
        expect(out).toContain(
            'stamp:      not yet: only 1 of 5 relays serves it back, and a final count is sure to see it only once 2 do'
        );
        expect(out).toContain("vote.ochk.io's anchorer also stamps every ballot it sees");
        expect(out).toContain('it sends the same signed stamp, with nothing new to sign');
        expect(sent(rs, 30083)).toHaveLength(5);
    });

    it('counts only copies of this stamp whose signature holds; at 2 it is stamped', async () => {
        stamping.make = true;
        const rs = await five(['keep', 'keep', 'keep', 'drop', 'drop'], [anchoredEvent]);
        rs[1]!.stampMode = 'junk-sig';
        rs[2]!.stampMode = 'bad-nostr';
        const got = JSON.parse((await voteOn(rs)).out);
        expect(got.in).toBe(true);
        expect(got.stamp.served_by).toEqual([rs[0]!.url]);
        expect(got.stamp.in).toBe(false);

        const both = await five(['keep', 'keep', 'drop', 'drop', 'drop'], [anchoredEvent]);
        const ok = await voteOn(both);
        const json = JSON.parse(ok.out);
        expect([json.stamp.in, json.stamp.served_by.length, ok.exit]).toEqual([true, 2, 0]);
    });

    it('republish sends a saved stamp again', async () => {
        stamping.make = true;
        const rs = await five(['keep', 'keep', 'drop', 'drop', 'drop'], [anchoredEvent]);
        rs[1]!.stampMode = 'drop';
        const got = JSON.parse((await voteOn(rs)).out);
        const file = join(dir, 'stamp.json');
        writeFileSync(file, JSON.stringify(got.stamp.event));
        rs[3]!.stampMode = 'keep';
        const again = await republish(rs, file);
        const st = JSON.parse(again.out);
        expect([st.stamp_id, st.in, again.exit]).toEqual([JSON.parse(got.stamp.event.content).id, true, 0]);
        expect(st.served_by).toEqual([rs[0]!.url, rs[3]!.url]);
    });
});
