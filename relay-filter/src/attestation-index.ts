import type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';
import type { Scheme } from '@orangecheck/sdk';

import { createHash } from 'node:crypto';

import {
    DEFAULT_RELAYS,
    nostrPubkeyToHex,
    parseIdentities,
    queryByAddress,
    queryByIdentity,
    verify,
} from '@orangecheck/sdk';

const DEFAULT_ALLOW_KINDS = [0, 3, 10002];
const DEFAULT_REFRESH_MS = 10 * 60_000;
const WARMUP_MS = 10_000;
// Background lookups for keys the subscription has not seen. Bounded so a
// sender rotating pubkeys costs at most this many open queries, never a queue.
const MAX_LOOKUPS_IN_FLIGHT = 4;
const LOOKUP_AGAIN_AFTER_MS = 10 * 60_000;
const MAX_LOOKUPS_REMEMBERED = 10_000;

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
}

export interface IndexOptions {
    /** Relays to subscribe to. Default: the SDK's discovery relays. */
    relays?: string[];
    /** How often each bond is re-read from the chain. Default 10 minutes. */
    refreshMs?: number;
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
    const { attestation_id: id, address, message, signature, scheme, issued_at } = env;
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
    const issuedAt = Date.parse(typeof issued_at === 'string' ? issued_at : '') || 0;
    return { id, address, message, signature, scheme, issuedAt, keys: [...new Set(keys)] };
}

/**
 * Every OC attestation that binds a Nostr key, held in memory and kept current
 * by one standing subscription. `decide()` answers from memory, so a relay's
 * write path never waits on the network. Bonds are re-read from the chain in
 * the background every `refreshMs`, which bounds how long a spent bond keeps
 * passing (SECURITY.md §2, chain finality).
 */
export class AttestationIndex {
    private readonly byId = new Map<string, Attestation>();
    private readonly bonds = new Map<string, Bond>();
    private readonly sockets: WebSocket[] = [];
    private timer: ReturnType<typeof setInterval> | undefined;
    private startedAt = 0;
    private readonly lookedUp = new Map<string, number>();
    private lookupsInFlight = 0;
    private synced = false;
    private stopped = false;

    constructor(private readonly options: IndexOptions = {}) {}

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
        if (!att || att.keys.length === 0 || this.byId.has(att.id)) return false;
        const newAddress = ![...this.byId.values()].some((a) => a.address === att.address);
        this.byId.set(att.id, att);
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

        const addresses = new Set<string>();
        for (const a of this.byId.values()) if (a.keys.includes(pubkey)) addresses.add(a.address);

        if (addresses.size === 0) {
            this.lookUp(pubkey);
            if (!this.synced && Date.now() - this.startedAt < WARMUP_MS) return this.pending(pubkey, opts);
            return {
                action: 'reject',
                reason: 'no_attestation',
                message: 'orangecheck: this relay requires a Bitcoin-stake proof (https://ochk.io). Have one? Retry in a few seconds.',
                pubkey,
            };
        }

        let unverified = false;
        let shared = false;
        let best: Bond | undefined;
        for (const address of addresses) {
            if (this.keysFor(address).size > 1) {
                shared = true;
                continue;
            }
            const bond = this.bonds.get(address);
            if (!bond) {
                unverified = true;
                continue;
            }
            if (bond.ok && (!best || bond.sats > best.sats)) best = bond;
        }

        const minSats = opts.minSats ?? 0;
        const minDays = opts.minDays ?? 0;
        if (best && best.sats >= minSats && best.days >= minDays) {
            return { action: 'accept', reason: 'ok', pubkey };
        }
        if (unverified) return this.pending(pubkey, opts);
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

    private pending(pubkey: string, opts: FilterOptions): FilterDecision {
        if (opts.failOpen) return { action: 'accept', reason: 'fail_open', pubkey };
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

    private keysFor(address: string): Set<string> {
        const keys = new Set<string>();
        for (const a of this.byId.values()) if (a.address === address) a.keys.forEach((k) => keys.add(k));
        return keys;
    }

    private async refresh(address: string): Promise<void> {
        let latest: Attestation | undefined;
        for (const a of this.byId.values()) {
            if (a.address === address && (!latest || a.issuedAt > latest.issuedAt)) latest = a;
        }
        if (!latest) return;
        try {
            const out = await verify({
                addr: latest.address,
                msg: latest.message,
                sig: latest.signature,
                scheme: latest.scheme,
            });
            this.bonds.set(address, {
                ok: out.ok,
                sats: out.metrics?.sats_bonded ?? 0,
                days: out.metrics?.days_unspent ?? 0,
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
