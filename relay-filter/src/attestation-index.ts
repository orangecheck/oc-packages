import type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';
import type { Scheme } from '@orangecheck/sdk';

import { createHash } from 'node:crypto';

import {
    DEFAULT_RELAYS,
    nostrPubkeyToHex,
    parseIdentities,
    queryByAddress,
    queryByIdentity,
    signatureIsValid,
    verify,
} from '@orangecheck/sdk';

import { chainUnreachable } from './outage';

const DEFAULT_ALLOW_KINDS = [0, 3, 10002];
const DEFAULT_REFRESH_MS = 10 * 60_000;
const WARMUP_MS = 10_000;
// Background lookups for keys the subscription has not seen. Bounded so a
// sender rotating pubkeys costs at most this many open queries, never a queue.
const MAX_LOOKUPS_IN_FLIGHT = 4;
const LOOKUP_AGAIN_AFTER_MS = 10 * 60_000;
const MAX_LOOKUPS_REMEMBERED = 10_000;
// A signed issued_at further ahead of this clock is not valid yet (OC Attest SPEC §7.2).
const ISSUED_AHEAD_MS = 120_000;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

interface Attestation {
    id: string;
    address: string;
    message: string;
    signature: string;
    scheme: Scheme;
    issuedAt: number;
    keys: string[];
}

interface Bond {
    ok: boolean;
    sats: number;
    days: number;
    /** The amount `days` was read for: the age of the coins covering it. */
    cover: number;
}

export interface IndexOptions {
    /** Relays to subscribe to. Default: the SDK's discovery relays. */
    relays?: string[];
    /** How often each bond is re-read from the chain. Default 10 minutes. */
    refreshMs?: number;
    /**
     * The `minSats` you pass to `decide()`. A bond's age is that of the coins
     * covering it (OC Attest SPEC §7 step 5.d); given here, every bond is read
     * for it from the start. A larger `minSats` at `decide()` re-reads them.
     */
    minSats?: number;
}

function signedLine(message: string, key: string): string | undefined {
    const hit = message.split('\n').find((l) => l.trim().toLowerCase().startsWith(key + ':'));
    return hit?.slice(hit.indexOf(':') + 1).trim();
}

/** Parse a kind-30078 event into an attestation, or null if it is not a sound one. */
export function parseAttestationEvent(event: {
    tags?: string[][];
    content?: string;
}): Attestation | null {
    let env: Record<string, unknown>;
    try {
        env = JSON.parse(event.content ?? '');
    } catch {
        return null;
    }
    const { attestation_id: id, address, message, signature, scheme } = env;
    if (typeof id !== 'string' || typeof address !== 'string' || typeof message !== 'string') return null;
    if (typeof signature !== 'string' || (scheme !== 'bip322' && scheme !== 'legacy')) return null;
    if (createHash('sha256').update(message).digest('hex') !== id) return null;
    if (signedLine(message, 'address') !== address) return null;
    const tags = event.tags ?? [];
    const d = tags.find((t) => t[0] === 'd')?.[1];
    if (d !== id && d !== `orangecheck:${id}`) return null;
    if (!tags.some((t) => t[0] === 't' && t[1] === address)) return null;

    let keys: string[] = [];
    try {
        keys = parseIdentities(signedLine(message, 'identities') ?? '')
            .filter((b) => b.protocol.toLowerCase() === 'nostr')
            .map((b) => nostrPubkeyToHex(b.identifier))
            .filter((k): k is string => k !== null);
    } catch {
        return null;
    }
    // The issue time the address signed, not the envelope's copy of it.
    const issued = signedLine(message, 'issued_at') ?? '';
    const issuedAt = RFC3339.test(issued) ? Date.parse(issued) : NaN;
    if (Number.isNaN(issuedAt)) return null;
    return { id, address, message, signature, scheme, issuedAt, keys: [...new Set(keys)] };
}

/**
 * Every OC attestation that binds a Nostr key, held in memory and kept current
 * by one standing subscription. `decide()` answers from memory, so a relay's
 * write path never waits on the network. Bonds are re-read from the chain in
 * the background every `refreshMs`, which bounds how long a spent bond keeps
 * passing (SECURITY.md §2, chain finality).
 */
/** One copy of an attestation: copies of one id may carry different signatures. */
const copyKey = (a: Attestation) => `${a.id}:${a.scheme}:${a.signature}`;

export class AttestationIndex {
    private readonly byId = new Map<string, Attestation>();
    /** Whether each copy's signature verifies; a copy that does not counts for nothing. */
    private readonly signed = new Map<string, boolean>();
    private readonly bonds = new Map<string, Bond>();
    /** Signature verified, but the chain API has not answered yet for this address. */
    private readonly chainDown = new Set<string>();
    private readonly sockets: WebSocket[] = [];
    private timer: ReturnType<typeof setInterval> | undefined;
    private startedAt = 0;
    private readonly lookedUp = new Map<string, number>();
    private lookupsInFlight = 0;
    private synced = false;
    private stopped = false;
    private cover: number;

    constructor(private readonly options: IndexOptions = {}) {
        this.cover = options.minSats ?? 0;
    }

    start(): void {
        this.startedAt = Date.now();
        for (const url of this.options.relays ?? DEFAULT_RELAYS) this.connect(url, 1_000);
        this.timer = setInterval(() => void this.refreshAll(), this.options.refreshMs ?? DEFAULT_REFRESH_MS);
        this.timer.unref?.();
    }

    stop(): void {
        this.stopped = true;
        if (this.timer) clearInterval(this.timer);
        for (const ws of this.sockets) ws.close();
    }

    /** Add one attestation event. Returns true if it was new and sound. */
    ingest(event: { tags?: string[][]; content?: string }): boolean {
        const att = parseAttestationEvent(event);
        if (!att || att.keys.length === 0 || this.byId.has(copyKey(att))) return false;
        const newAddress = ![...this.byId.values()].some((a) => a.address === att.address);
        this.byId.set(copyKey(att), att);
        // Everything this address signed, marker or not, so a second key it backs is seen.
        if (newAddress) {
            void queryByAddress(att.address, this.options.relays ?? DEFAULT_RELAYS)
                .then((events) => events.forEach((e) => this.ingest(e)))
                .catch(() => {});
        }
        void this.refresh(att.address);
        return true;
    }

    /** Mark the initial backlog as loaded; before this, unknown keys are "not yet", not "no". */
    markSynced(): void {
        this.synced = true;
    }

    decide(event: MinimalNostrEvent, opts: FilterOptions = {}): FilterDecision {
        const pubkey = event.pubkey.toLowerCase();
        if ((opts.allowKinds ?? DEFAULT_ALLOW_KINDS).includes(event.kind)) {
            return { action: 'accept', reason: 'allowed_kind' };
        }
        if (opts.allowPubkeys?.some((k) => nostrPubkeyToHex(k) === pubkey)) {
            return { action: 'accept', reason: 'allowed_pubkey', pubkey };
        }

        const minSats = opts.minSats ?? 0;
        const minDays = opts.minDays ?? 0;
        if (minSats > this.cover) {
            this.cover = minSats;
            void this.refreshAll();
        }

        const addresses = new Set<string>();
        for (const a of this.byId.values()) if (a.keys.includes(pubkey)) addresses.add(a.address);

        if (addresses.size === 0) {
            this.lookUp(pubkey);
            if (!this.synced && Date.now() - this.startedAt < WARMUP_MS) return this.pending(pubkey);
            return {
                action: 'reject',
                reason: 'no_attestation',
                message: 'orangecheck: this relay requires a Bitcoin-stake proof (https://ochk.io). Have one? Retry in a few seconds.',
                pubkey,
            };
        }

        let unverified = false;
        let unreadable = false;
        let shared = false;
        let best: Bond | undefined;
        for (const address of addresses) {
            if (this.keysFor(address).size > 1) {
                shared = true;
                continue;
            }
            const bond = this.bonds.get(address);
            // An age read for a smaller amount can overstate this one's.
            if (!bond || (minDays > 0 && bond.cover < minSats)) {
                if (this.chainDown.has(address)) unreadable = true;
                else unverified = true;
                continue;
            }
            if (bond.ok && (!best || bond.sats > best.sats)) best = bond;
        }

        if (best && best.sats >= minSats && best.days >= minDays) {
            return { action: 'accept', reason: 'ok', pubkey };
        }
        if (unverified) return this.pending(pubkey);
        if (unreadable) {
            if (opts.failOpen) return { action: 'accept', reason: 'fail_open', pubkey };
            return {
                action: 'reject',
                reason: 'lookup_error',
                message: 'orangecheck: cannot read your bond from the chain right now, try again shortly',
                pubkey,
            };
        }
        if (shared && !best) {
            return {
                action: 'reject',
                reason: 'stake_shared',
                message: 'orangecheck: this Bitcoin address also backs another Nostr key; use one address per key',
                pubkey,
            };
        }
        if (best) {
            return {
                action: 'reject',
                reason: 'below_threshold',
                message: `orangecheck: proof below relay thresholds (min_sats=${minSats}, min_days=${minDays})`,
                pubkey,
            };
        }
        return { action: 'reject', reason: 'invalid_proof', message: 'orangecheck: proof invalid', pubkey };
    }

    /** Attestations held, for logging. */
    get size(): number {
        return this.byId.size;
    }

    /** Not yet verified. Never fails open: an unchecked signature proves nothing. */
    private pending(pubkey: string): FilterDecision {
        return {
            action: 'reject',
            reason: 'lookup_error',
            message: 'orangecheck: verifying your proof, try again shortly',
            pubkey,
        };
    }

    /**
     * Not every attestation carries the `oc-attest` marker the subscription
     * filters on, so an unseen key is also looked up by identity, off the
     * write path. The key's next event is decided with whatever was found.
     */
    private lookUp(pubkey: string): void {
        const last = this.lookedUp.get(pubkey);
        if (last !== undefined && Date.now() - last < LOOKUP_AGAIN_AFTER_MS) return;
        if (this.lookupsInFlight >= MAX_LOOKUPS_IN_FLIGHT) return;
        if (this.lookedUp.size >= MAX_LOOKUPS_REMEMBERED) {
            const oldest = this.lookedUp.keys().next().value;
            if (oldest !== undefined) this.lookedUp.delete(oldest);
        }
        this.lookedUp.set(pubkey, Date.now());
        this.lookupsInFlight++;
        queryByIdentity('nostr', pubkey, this.options.relays ?? DEFAULT_RELAYS)
            .then((events) => events.forEach((e) => this.ingest(e)))
            .catch(() => {})
            .finally(() => this.lookupsInFlight--);
    }

    /** The keys this address signed for. Only the address's own signature counts. */
    private keysFor(address: string): Set<string> {
        const keys = new Set<string>();
        for (const a of this.byId.values()) {
            if (a.address === address && this.signed.get(copyKey(a))) a.keys.forEach((k) => keys.add(k));
        }
        return keys;
    }

    /** Newest signed issued_at first, none dated ahead of this clock (OC Attest SPEC §7.2). */
    private candidates(address: string): Attestation[] {
        const latest = Date.now() + ISSUED_AHEAD_MS;
        return [...this.byId.values()]
            .filter((a) => a.address === address && a.issuedAt <= latest)
            .sort((a, b) => b.issuedAt - a.issuedAt || (a.id < b.id ? -1 : 1));
    }

    private async refresh(address: string): Promise<void> {
        const list = this.candidates(address);
        // Each copy's signature is checked once; a known answer costs no wait.
        for (const a of list) {
            const key = copyKey(a);
            if (this.signed.has(key)) continue;
            this.signed.set(key, await signatureIsValid({ addr: a.address, msg: a.message, sig: a.signature, scheme: a.scheme }));
        }
        // The newest the address signed; with none, the newest, so its bond reads as invalid.
        const latest = list.find((a) => this.signed.get(copyKey(a))) ?? list[0];
        if (!latest) return;
        const cover = this.cover;
        try {
            const out = await verify(
                {
                    addr: latest.address,
                    msg: latest.message,
                    sig: latest.signature,
                    scheme: latest.scheme,
                },
                { coverSats: cover > 0 ? cover : undefined }
            );
            // A chain-API outage is not a verdict: keep the last known bond.
            if (chainUnreachable(out.codes)) {
                if (!this.bonds.has(address)) this.chainDown.add(address);
                return;
            }
            this.chainDown.delete(address);
            // Never replace a bond read for a larger amount with a lagging one.
            if (cover < (this.bonds.get(address)?.cover ?? 0)) return;
            this.bonds.set(address, {
                ok: out.ok,
                sats: out.metrics?.sats_bonded ?? 0,
                days: out.metrics?.days_unspent ?? 0,
                cover,
            });
        } catch {
            // Keep the last known bond; a chain-API blip must not flip every decision.
        }
    }

    private async refreshAll(): Promise<void> {
        const addresses = new Set([...this.byId.values()].map((a) => a.address));
        for (const address of addresses) await this.refresh(address);
    }

    private connect(url: string, backoffMs: number): void {
        if (this.stopped) return;
        let ws: WebSocket;
        try {
            ws = new WebSocket(url);
        } catch {
            this.retry(url, backoffMs);
            return;
        }
        this.sockets.push(ws);
        ws.onopen = () => {
            ws.send(JSON.stringify(['REQ', 'oc-index', { kinds: [30078], '#t': ['oc-attest'] }]));
        };
        ws.onmessage = (m: MessageEvent) => {
            try {
                const frame = JSON.parse(String(m.data));
                if (frame[0] === 'EVENT' && frame[2]) this.ingest(frame[2]);
                else if (frame[0] === 'EOSE') this.markSynced();
            } catch {
                // ignore malformed frames
            }
        };
        ws.onclose = () => {
            const i = this.sockets.indexOf(ws);
            if (i !== -1) this.sockets.splice(i, 1);
            this.retry(url, backoffMs);
        };
        ws.onerror = () => ws.close();
    }

    private retry(url: string, backoffMs: number): void {
        if (this.stopped) return;
        const t = setTimeout(() => this.connect(url, Math.min(backoffMs * 2, 60_000)), backoffMs);
        t.unref?.();
    }
}
