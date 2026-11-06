// The 0.4 handle walk over this client's reads: the directory relay read completely,
// the audit bounded, records checked before any read, and the holder's own listing
// (never a stranger's copy) giving the profile.
import { claimId, directoryDtag } from '@orangecheck/lock-core/directory';
import { hexDecode } from '@orangecheck/lock-crypto';
import { base64Encode, serializeTimestamp } from '@orangecheck/stamp-ots';
import type { NostrEvent } from '@orangecheck/lock-device';
import { describe, expect, it } from 'vitest';

import {
    bareProof as bareProofAt,
    claim,
    h,
    listing,
    pk,
    sign,
    TIP,
    world,
} from './__fixtures__/directory-world';
import ochkroot from './__fixtures__/ochkroot-v1-listing.json';

import { AUDIT_RELAYS, resolveDirectoryHandle } from './directory';

const ALICE = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const BOB = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

describe('resolveDirectoryHandle', () => {
    it('the first anchored claim on the directory relay holds, and its own listing is the profile', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        const b = claim('alice', BOB, TIP - 50, 'bob');
        anchorAt(a, ALICE);
        anchorAt(b, BOB);
        w.bound.set(ALICE, [pk(1)]);
        w.bound.set(BOB, [pk(2)]);
        w.relays.set('wss://relay.ochk.io', [
            listing(2, 'alice', BOB, b),
            listing(1, 'alice', ALICE, a, { display_name: 'Alice' }),
        ]);
        const out = await resolveDirectoryHandle('Alice', 'people', deps);
        expect(out).toMatchObject({
            result: 'holds',
            holder: ALICE,
            claimId: a.id,
            anchor: TIP - 100,
        });
        expect(out.result === 'holds' && out.listing.content.display_name).toBe('Alice');
    });

    it("a stranger's newer copy of the holder's listing never gives the profile", async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        // Signed by key 9, which no device record binds to ALICE; it names its own key as inbox.
        const forged = listing(
            9,
            'alice',
            ALICE,
            a,
            { display_name: 'Pay me', postage_floor_sats: 99999 },
            1_790_000_500
        );
        w.relays.set('wss://relay.ochk.io', [
            listing(1, 'alice', ALICE, a, { display_name: 'Alice' }),
            forged,
        ]);
        const out = await resolveDirectoryHandle('alice', 'people', deps);
        expect(out.result === 'holds' && out.listing.content.display_name).toBe('Alice');
    });

    it('a listing not signed by its inbox key is dropped before any read', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        const content = {
            v: 2,
            handle: 'alice',
            address: ALICE,
            inbox_pubkey: pk(1),
            claim: a.claim,
            opted_in: true,
            created_at: 1,
        };
        w.relays.set('wss://relay.ochk.io', [sign(2, content, directoryDtag('alice'))]);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNVERIFIED',
        });
        expect(w.headerReads).toBe(0);
    });

    it('nothing listed is not found only when the directory relay answered in full', async () => {
        const { w, deps } = world();
        expect(await resolveDirectoryHandle('nobody', 'people', deps)).toEqual({
            result: 'not_found',
        });
        w.incomplete.add('wss://relay.ochk.io');
        expect(await resolveDirectoryHandle('nobody', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
    });

    it.each([
        ['throws', 'throw'],
        ['stops early', 'incomplete'],
    ] as const)(
        'an audit relay that %s while the directory relay answered leaves the walk to the directory',
        async (_, how) => {
            const { w, deps, anchorAt } = world();
            const a = claim('alice', ALICE, TIP - 100);
            anchorAt(a, ALICE);
            w.bound.set(ALICE, [pk(1)]);
            w.relays.set('wss://relay.ochk.io', [listing(1, 'alice', ALICE, a)]);
            const asked: string[] = [];
            const failing = {
                ...deps,
                page: async (relay: string, filter: Parameters<typeof deps.page>[1]) => {
                    if (relay === 'wss://relay.ochk.io') return deps.page(relay, filter);
                    asked.push(relay);
                    if (how === 'throw') throw new Error('relay down');
                    return { events: [], complete: false };
                },
            };
            expect(await resolveDirectoryHandle('alice', 'people', failing)).toMatchObject({
                result: 'holds',
                holder: ALICE,
            });
            expect(await resolveDirectoryHandle('nobody', 'people', failing)).toEqual({
                result: 'not_found',
            });
            expect(new Set(asked)).toEqual(new Set(AUDIT_RELAYS));
        }
    );

    it('with the directory relay unanswered, a claim on public relays is walked as the directory', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.incomplete.add('wss://relay.ochk.io');
        w.relays.set('wss://nos.lol', [listing(1, 'alice', ALICE, a)]);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('a read without an answer before the holder is unresolved, never a pass to the next claim', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        const b = claim('alice', BOB, TIP - 50, 'bob');
        anchorAt(a, ALICE);
        anchorAt(b, BOB);
        w.coins.delete(a.claim.outpoint);
        w.bound.set(ALICE, [pk(1)]);
        w.bound.set(BOB, [pk(2)]);
        w.relays.set('wss://relay.ochk.io', [
            listing(1, 'alice', ALICE, a),
            listing(2, 'alice', BOB, b),
        ]);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
    });

    it('the header budget goes to the lowest claimed anchors first, whatever order the relays answer in', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.incomplete.add('wss://relay.ochk.io');
        // 140 claims naming later blocks, each a header read, answered before the real one.
        const junk = Array.from({ length: 140 }, (_, i) =>
            listing(2, 'alice', BOB, claim('alice', BOB, TIP - 99 + i, 'junk' + i))
        );
        w.relays.set('wss://relay.damus.io', junk);
        w.relays.set('wss://nos.lol', [listing(1, 'alice', ALICE, a)]);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('public records with fake low anchors cannot spend the budget the directory relay’s holder needs (§8.2.6)', async () => {
        const { w, deps, anchorAt, publish } = world();
        const a = claim('alice', ALICE, 925_000);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        publish(listing(1, 'alice', ALICE, a));
        // 17 listings on damus, 8 unanchored attestations each: 136 header reads, past the budget.
        const junk = Array.from({ length: 17 }, (_, i) => {
            const outpoint = `${h('junk coin ' + i)}:0`;
            const nonce = h('junk nonce ' + i);
            const id = claimId({ handle: 'alice', address: BOB, outpoint, nonce });
            const ots = base64Encode(
                serializeTimestamp({
                    msg: hexDecode(id),
                    attestations: Array.from({ length: 8 }, (_, k) => ({
                        kind: 'bitcoin' as const,
                        height: 1000 + i * 8 + k,
                    })),
                    ops: [],
                })
            );
            return listing(10 + i, 'alice', BOB, {
                id,
                height: 0,
                claim: { outpoint, nonce, ots },
            });
        });
        w.relays.set('wss://relay.damus.io', junk);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it.each([
        ['relay.ochk.io holds the holder’s copy', false],
        ['relay.ochk.io does not answer', true],
    ])(
        'a stranger’s copy with a fake lower attestation does not move the claim’s anchor (%s)',
        async (_, unanswered) => {
            const { w, deps, anchorAt, publish } = world();
            const a = claim('alice', ALICE, 925_000);
            anchorAt(a, ALICE);
            w.bound.set(ALICE, [pk(1)]);
            if (unanswered) {
                w.incomplete.add('wss://relay.ochk.io');
                w.relays.set('wss://nos.lol', [listing(1, 'alice', ALICE, a)]);
            } else publish(listing(1, 'alice', ALICE, a));
            w.roots.set(1000, h('another block'));
            w.roots.set(925_010, a.id);
            const ots = base64Encode(
                serializeTimestamp({
                    msg: hexDecode(a.id),
                    attestations: [
                        { kind: 'bitcoin' as const, height: 1000 },
                        { kind: 'bitcoin' as const, height: 925_010 },
                    ],
                    ops: [],
                })
            );
            w.relays.set('wss://relay.damus.io', [
                listing(50, 'alice', ALICE, { ...a, claim: { ...a.claim, ots } }),
            ]);
            expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
                result: 'holds',
                anchor: 925_000,
            });
        }
    );

    it('the claim’s place is its lowest anchor among its copies', async () => {
        const { w, deps } = world();
        const a = claim('alice', ALICE, TIP - 100);
        w.roots.set(TIP - 100, a.id);
        w.coins.set(a.claim.outpoint, {
            confirmedAt: TIP - 600,
            value: 5000,
            paysTo: ALICE,
            spendHeight: null,
        });
        w.bound.set(ALICE, [pk(1)]);
        // A later copy of the same claim, with a proof anchored higher up, comes first.
        const later = bareProofAt(a.id, TIP - 40);
        w.roots.set(TIP - 40, a.id);
        w.relays.set('wss://relay.ochk.io', [
            listing(
                1,
                'alice',
                ALICE,
                { ...a, claim: { ...a.claim, ots: later } },
                {},
                1_790_000_100
            ),
            listing(1, 'alice', ALICE, a, {}, 1_790_000_000),
        ]);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            anchor: TIP - 100,
        });
    });

    it('a full page of junk the reader drops is still a full page: the read goes on past it', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        const newer = listing(2, 'alice', BOB, claim('alice', BOB, TIP - 50, 'bob'), {}, 1_790_000_900);
        w.relays.set('wss://relay.ochk.io', [newer, listing(1, 'alice', ALICE, a, {}, 1_790_000_000)]);
        const real = deps.page;
        // The relay sends a full page: one listing that verifies, and 199 the reader
        // drops for their signatures. Only the next page reaches alice's claim.
        deps.page = async (relay, filter) => {
            const got = await real(relay, filter);
            if (relay !== 'wss://relay.ochk.io' || filter.until !== undefined) return got;
            return { events: got.events.slice(0, 1), complete: true, sent: filter.limit };
        };
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('a full page that is all junk has not been read completely, never "not listed"', async () => {
        const { w, deps } = world();
        w.relays.set('wss://relay.ochk.io', []);
        const real = deps.page;
        deps.page = async (relay, filter) =>
            relay === 'wss://relay.ochk.io'
                ? { events: [], complete: true, sent: filter.limit }
                : real(relay, filter);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
    });

    it('an audit relay that pads a page with junk is read past it, so the earlier claim it holds counts', async () => {
        const { w, deps, anchorAt, publish } = world();
        const a = claim('alice', ALICE, TIP - 100);
        const b = claim('alice', BOB, TIP - 50, 'bob');
        anchorAt(a, ALICE);
        anchorAt(b, BOB);
        w.bound.set(ALICE, [pk(1)]);
        w.bound.set(BOB, [pk(2)]);
        publish(listing(2, 'alice', BOB, b));
        w.relays.set('wss://nos.lol', [
            listing(2, 'alice', BOB, b, {}, 1_790_000_900),
            listing(1, 'alice', ALICE, a, {}, 1_790_000_000),
        ]);
        const real = deps.page;
        deps.page = async (relay, filter) => {
            const got = await real(relay, filter);
            if (relay !== 'wss://nos.lol' || filter.until !== undefined) return got;
            return { events: got.events.slice(0, 1), complete: true, sent: filter.limit };
        };
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('a directory relay that stalls on a full page has not been read completely', async () => {
        const { w, deps } = world();
        const same = Array.from({ length: 200 }, (_, i) =>
            sign(10 + (i % 50), { v: 2, handle: 'x' + i }, directoryDtag('alice'), 1_790_000_000)
        );
        w.relays.set('wss://relay.ochk.io', same);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
    });

    /** `n` signed events under alice's d tag that hold no listing, newer than any claim here. */
    const filler = (n: number) =>
        Array.from({ length: n }, (_, i) =>
            sign(10 + (i % 50), { v: 2, handle: 'x' + i }, directoryDtag('alice'), 1_790_001_000 + i)
        );
    /** A page reader whose `relay` sends at most `cap` events a REQ, whatever was asked. */
    const capped = (deps: ReturnType<typeof world>['deps'], relay: string, cap: number) => {
        const real = deps.page;
        deps.page = async (r, filter) => {
            const got = await real(r, filter);
            return r === relay ? { ...got, events: got.events.slice(0, cap) } : got;
        };
    };

    it('a directory relay that sends 150 a page is read past them to the claim behind', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.relays.set('wss://relay.ochk.io', [listing(1, 'alice', ALICE, a, {}, 1_790_000_000), ...filler(150)]);
        capped(deps, 'wss://relay.ochk.io', 150);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('an audit relay that sends 150 a page is read past them, so the earlier claim it holds counts', async () => {
        const { w, deps, anchorAt, publish } = world();
        const a = claim('alice', ALICE, TIP - 100);
        const b = claim('alice', BOB, TIP - 50, 'bob');
        anchorAt(a, ALICE);
        anchorAt(b, BOB);
        w.bound.set(ALICE, [pk(1)]);
        w.bound.set(BOB, [pk(2)]);
        publish(listing(2, 'alice', BOB, b));
        w.relays.set('wss://nos.lol', [listing(1, 'alice', ALICE, a, {}, 1_790_000_000), ...filler(150)]);
        capped(deps, 'wss://nos.lol', 150);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('a directory relay whose read stops partway has not been read completely', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.relays.set('wss://relay.ochk.io', [listing(1, 'alice', ALICE, a, {}, 1_790_000_000), ...filler(150)]);
        capped(deps, 'wss://relay.ochk.io', 150);
        const real = deps.page;
        deps.page = async (r, filter) =>
            r === 'wss://relay.ochk.io' && filter.until !== undefined
                ? { events: [], complete: false }
                : real(r, filter);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
    });

    it('a directory relay whose NIP-11 document declares a page under 100 has not been read completely', async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.relays.set('wss://relay.ochk.io', [listing(1, 'alice', ALICE, a)]);
        deps.maxLimit = async (relay) => (relay === 'wss://relay.ochk.io' ? 50 : undefined);
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
        deps.maxLimit = async () => 500;
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ALICE,
        });
    });

    it('every REQ the read makes of a relay stays under the handle\'s d tag, the stepped-past second\'s check included', async () => {
        const { w, deps } = world();
        w.relays.set(
            'wss://relay.ochk.io',
            Array.from({ length: 200 }, (_, i) =>
                sign(10 + (i % 50), { v: 2, handle: 'x' + i }, directoryDtag('alice'), 1_790_000_000)
            )
        );
        const asked: Parameters<typeof deps.page>[1][] = [];
        const real = deps.page;
        deps.page = async (relay, filter) => {
            if (relay === 'wss://relay.ochk.io') asked.push(filter);
            return real(relay, filter);
        };
        expect(await resolveDirectoryHandle('alice', 'people', deps)).toEqual({
            result: 'E_DIR_UNRESOLVED',
        });
        // A page at one second, the step past it, then the check of what the relay sends a page.
        expect(asked.map((f) => f.until)).toEqual([undefined, 1_789_999_999, undefined]);
        expect(asked.every((f) => f['#d'].length === 1 && f['#d'][0] === directoryDtag('alice'))).toBe(true);
    });

    it('@ochkroot: exactly the anchored v1 listing carries the shipped legacy claim (§8.2.8)', async () => {
        const { w, deps } = world();
        const ROOT = 'bc1pezn5yjxmz9nuahtqprvhfeya2nv4zdfk49u5amquhqptykx695rs60hqa2';
        // The real header of block 973103, which the legacy proof attests twice.
        const real = hexDecode(
            '00a0fc221b8905aaebb9ca3042191a463419e9bef9d6a001e42b01000000000000000000495505bd54687f50b4260d97c3b827dd9a5ee23b5d50730c7df6922051046eeebf43de6a930002174c1cae08'
        );
        deps.headers = { getHeaderAt: async (height) => (height === 973103 ? real : null) };
        deps.tip = async () => 973200;
        w.coins.set('bd20e0fb096e5bce89ec33f7cebe0c34e04e31d83db6de00551a6a86f12a00cd:0', {
            confirmedAt: 920374,
            value: 546,
            paysTo: ROOT,
            spendHeight: null,
        });
        w.bound.set(ROOT, [ochkroot.pubkey]);
        w.relays.set('wss://relay.ochk.io', [ochkroot as NostrEvent]);
        expect(await resolveDirectoryHandle('ochkroot', 'people', deps)).toMatchObject({
            result: 'holds',
            holder: ROOT,
            anchor: 973103,
        });
        // Any other bytes under the same id would not be this listing: the claim is never carried.
        const altered = {
            ...(ochkroot as NostrEvent),
            content: (ochkroot as NostrEvent).content.replace(
                'OrangeCheck Root',
                'OrangeCheck R00t'
            ),
        };
        w.relays.set('wss://relay.ochk.io', [altered]);
        expect((await resolveDirectoryHandle('ochkroot', 'people', deps)).result).not.toBe('holds');
        // The claim rides only on the anchored bytes, even under a reader that took the event's id on trust.
        expect((await resolveDirectoryHandle('ochkroot', 'people', { ...deps, verifyEvent: () => true })).result).not.toBe('holds');
        // A deployment that anchored no legacy claims reads the same v1 listing as holding nothing.
        w.relays.set('wss://relay.ochk.io', [ochkroot as NostrEvent]);
        expect((await resolveDirectoryHandle('ochkroot', 'people', { ...deps, legacy: [] })).result).not.toBe('holds');
    });

    it("a deployment's own directory and audit relays are the ones read", async () => {
        const { w, deps, anchorAt } = world();
        const a = claim('alice', ALICE, TIP - 100);
        anchorAt(a, ALICE);
        w.bound.set(ALICE, [pk(1)]);
        w.relays.set('wss://dir.example', [listing(1, 'alice', ALICE, a)]);
        const own = { ...deps, directoryRelays: ['wss://dir.example'], auditRelays: [] };
        expect(await resolveDirectoryHandle('alice', 'people', own)).toMatchObject({ result: 'holds', holder: ALICE });
        // The reference relays hold nothing here, so the default deployment finds nobody.
        expect((await resolveDirectoryHandle('alice', 'people', deps)).result).not.toBe('holds');
    });
});
