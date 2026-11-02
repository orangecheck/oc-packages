// `oc-vote vote` and `oc-vote republish` end to end, over relays on 127.0.0.1
// that say OK to every EVENT and keep it, keep nothing, or keep a forged copy.
// Real WebSockets, real Nostr signatures and BIP-322 ballots; the wallet is a
// stand-in that signs with a throwaway key. Nothing leaves 127.0.0.1.
//
// A ballot is in only once min(2, asked) relays, each asked alone, serve a
// valid copy back. Below that the command says so, exits 2, and gives the
// signed event, which `republish` sends again as it is.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { closeRelayPool } from '@orangecheck/nostr-core';
import { ballotId, pollId, type Ballot, type Poll } from '@orangecheck/vote-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import { buildBallotEvent, buildPollEvent } from './events.js';
import type { NostrEvent } from './nostr.js';

const kCreator = '11'.repeat(32);
const kVoter = '22'.repeat(32);
const kStranger = '33'.repeat(32);
const CREATOR = addressFromPrivateKey(kCreator, 'p2wpkh');
const VOTER = addressFromPrivateKey(kVoter, 'p2wpkh');
const STRANGER = addressFromPrivateKey(kStranger, 'p2wpkh');

// The wallet: signs what it is shown with the voter's throwaway key, and counts.
const wallet = vi.hoisted(() => ({ signs: 0 }));
vi.mock('./sig.js', () => ({
    promptForSignature: async (address: string, id: string) => {
        wallet.signs++;
        return signMessage(address, id, '22'.repeat(32));
    },
}));

// An anchored poll's ballot is stamped by the voter's client; here the stamp
// is only counted, and no calendar is reached.
const stamping = vi.hoisted(() => ({ calls: 0 }));
vi.mock('./anchors.js', async (actual) => ({
    ...(await actual<typeof import('./anchors.js')>()),
    stampBallot: async () => {
        stamping.calls++;
        throw new Error('no calendar here');
    },
}));

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

/** What a relay does with a ballot it is sent; it says OK either way. */
type Mode = 'keep' | 'drop' | 'junk-sig' | 'bad-nostr';

interface Relay {
    url: string;
    mode: Mode;
    store: NostrEvent[];
    received: NostrEvent[];
}

/** The ballot in `ev` signed by someone else, under the same ballot_id, in a fresh event. */
function junkSig(ev: NostrEvent): NostrEvent {
    const b = JSON.parse(ev.content) as Ballot;
    const junk = { ...b, sig: { ...b.sig, value: signMessage(STRANGER, ballotId(b), kStranger) } };
    expect(ballotId(junk)).toBe(ballotId(b));
    return buildBallotEvent(junk);
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

/** A relay at 127.0.0.1 holding `polls`, answering like strfry, doing `mode` with ballots. */
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
                if (ev.kind === 30081) {
                    if (r.mode === 'keep') r.store.push(ev);
                    if (r.mode === 'junk-sig') r.store.push(junkSig(ev));
                    if (r.mode === 'bad-nostr') r.store.push(badNostr(ev));
                } else r.store.push(ev);
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
