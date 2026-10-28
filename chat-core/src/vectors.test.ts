// The oc-chat-protocol vectors for the artifacts this package verifies: the
// directory d-tag and listing id (vc07, vc08), channel ids and the write gate
// (vc14–vc17), session step-up (vc18), version coordinates and reads (vc19) and
// version bindings at a fork (vc20). vc18–vc20 carry real BIP-322, Schnorr and
// Ed25519 signatures; only the relays are served from the vector.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifySignature } from '@orangecheck/bip322';
import { directoryDtag, listingId } from '@orangecheck/lock-core/directory';
import { matchFilter } from '@orangecheck/nostr-core';
import { describe, expect, it } from 'vitest';

import {
    channelId,
    descriptorDtag,
    descriptorId,
    evaluateWriteProof,
    policyRootedMatches,
    postDtag,
    postId,
    readChannelVersions,
    resolveChannelChain,
    versionDtag,
    type DescriptorContent,
    type QueryAnswer,
} from './index';
import { deviceDtag, recordReads, stepUpAddress } from './records';
import type { AuthHostKey } from './session';
import type { NostrEvent } from './event';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** OC_CHAT_VECTORS_DIR (CI), else a sibling clone of oc-chat-protocol, else skip. */
function vectorsDir(): string | null {
    if (process.env.OC_CHAT_VECTORS_DIR && existsSync(process.env.OC_CHAT_VECTORS_DIR)) {
        return process.env.OC_CHAT_VECTORS_DIR;
    }
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-chat-protocol', 'test-vectors');
    return existsSync(join(sibling, 'vc20-channel-version-binding.json')) ? sibling : null;
}
const DIR = vectorsDir();
// In CI the vectors are checked out (OC_CHAT_VECTORS_DIR); a missing set must fail, not skip.
if (!DIR && process.env.CI) throw new Error('oc-chat-protocol test vectors not found: set OC_CHAT_VECTORS_DIR');
const describeVector = DIR ? describe : describe.skip;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (name: string): any => JSON.parse(readFileSync(join(DIR as string, name), 'utf8'));

const verifyBip322 = ({ address, message, signature }: { address: string; message: string; signature: string }) =>
    verifySignature(address, message, signature);

/** Binding reads over a relay that holds exactly `held`. */
function readsOver(held: readonly NostrEvent[], keys: readonly AuthHostKey[], now: Date) {
    return recordReads(
        async (p) => ({
            events: held.filter((e) => e.tags.some((t) => t[0] === 'd' && t[1] === deviceDtag(p))),
            answered: true,
        }),
        { hostKeys: async () => keys, verifyBip322, now: () => now }
    );
}

/** A relay over `store`: newest first, `until` inclusive, `limit` honored. */
function relayOver(store: () => readonly NostrEvent[], calls?: Record<string, unknown>[]) {
    return async (filter: Record<string, unknown>): Promise<QueryAnswer> => {
        calls?.push(filter);
        const until = (filter.until as number | undefined) ?? Infinity;
        const events = store()
            .filter((e) => e.created_at <= until && matchFilter(e, filter as never))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, (filter.limit as number | undefined) ?? Infinity);
        return { events, relayStatus: [{ eose: true }] };
    };
}

const content = (e: NostrEvent) => JSON.parse(e.content) as DescriptorContent;

describeVector('vc07, vc08 — directory d-tag and listing id (SPEC §8.2.1, §8.2.4)', () => {
    it('vc07 — the d-tag is the salted handle hash', () => {
        const v = load('vc07-directory-dtag.json');
        const tag = directoryDtag(v.inputs.handle as string);
        expect(tag).toBe(v.expected.d_tag);
        expect(tag.length).toBe(v.expected.d_tag_len);
    });

    it('vc08 — a listing and its tombstone share a d-tag and differ by id', () => {
        const v = load('vc08-directory-listing.json');
        expect(listingId(v.inputs.listing)).toBe(v.expected.listing_id);
        expect(listingId(v.inputs.tombstone)).toBe(v.expected.tombstone_id);
        expect(directoryDtag(v.inputs.listing.handle) === directoryDtag(v.inputs.tombstone.handle)).toBe(
            v.expected.same_d_tag
        );
    });
});

describeVector('vc14–vc17 — channel ids and the write gate (SPEC §8.3)', () => {
    it('vc14 — channel identity, legacy d-tag, content address, policy match', () => {
        const v = load('vc14-channel-descriptor.json');
        const cid = channelId(v.inputs.founder_address, v.inputs.slug);
        expect(cid).toBe(v.expected.channel_id);
        expect(descriptorDtag(cid)).toBe(v.expected.descriptor_dtag);
        expect(descriptorId(v.inputs.descriptor)).toBe(v.expected.descriptor_id);
        expect(versionDtag(v.expected.descriptor_id)).toBe(v.expected.version_dtag);
        expect(cid).toBe(v.expected.t_tag);
        expect(policyRootedMatches(v.inputs.descriptor.write)).toBe(v.expected.policy_rooted_match);
    });

    it('vc15 — each version has its own d-tag and shares the t tag', () => {
        const v = load('vc15-channel-governance.json');
        const v1id = load('vc14-channel-descriptor.json').expected.descriptor_id as string;
        expect(descriptorId(v.inputs.descriptor_v2)).toBe(v.expected.descriptor_v2_id);
        expect(versionDtag(v1id)).toBe(v.expected.v1_dtag);
        expect(versionDtag(v.expected.descriptor_v2_id)).toBe(v.expected.v2_dtag);
        expect(v.inputs.descriptor_v2.supersedes).toBe(v1id);
        expect(v.expected.v2_s_tag).toBe(v1id);
    });

    it('vc16 — post content address and d-tag', () => {
        const v = load('vc16-channel-post.json');
        const pid = postId(v.inputs.post);
        expect(pid).toBe(v.expected.post_id);
        expect(postDtag(v.inputs.post.channel_id, pid)).toBe(v.expected.post_dtag);
    });

    it('vc17 — age and value are judged apart', () => {
        const v = load('vc17-channel-utxo-write-proof.json');
        for (const key of ['clears', 'below_floor_age', 'below_floor_value'] as const) {
            const want = v.expected[key];
            const got = evaluateWriteProof(v.inputs[key], v.inputs.policy, v.inputs.current_tip_height);
            expect(got.ageConfs, key).toBe(want.age_confs);
            expect(got.verdict, key).toBe(want.verdict);
            if ('meets_age' in want) expect(got.meetsAge, key).toBe(want.meets_age);
            if ('meets_value' in want) expect(got.meetsValue, key).toBe(want.meets_value);
        }
    });
});

describeVector('vc18 — a session message steps up only to a bound address (SPEC §8.6)', () => {
    const v = DIR ? load('vc18-session-step-up.json') : null;
    for (const c of (v?.cases ?? []) as {
        name: string;
        records_by_author: string[];
        records_by_address: string[];
        expected: { display: 'verified' | 'session'; address?: string };
    }[]) {
        it(c.name, async () => {
            const record = (k: string) => v.inputs[k] as NostrEvent;
            const reads = readsOver(c.records_by_address.map(record), [], new Date());
            const got = await stepUpAddress(v.inputs.signing_key, c.records_by_author.map(record), reads.isBound);
            expect(got).toBe(c.expected.display === 'verified' ? c.expected.address : null);
        });
    }
});

describeVector('vc19 — a reader fetches every version by t tag and the legacy d-tag (SPEC §8.3.1)', () => {
    const v = DIR ? load('vc19-channel-version-coordinates.json') : null;
    const versions = (v?.inputs.versions ?? {}) as Record<string, NostrEvent>;

    it('each 0.3.0 version is at its own d-tag', () => {
        for (const [name, dtag] of Object.entries(v.expected.town.d_tags as Record<string, string>)) {
            const ev = versions[name]!;
            expect(ev.tags.find((t) => t[0] === 'd')?.[1]).toBe(dtag);
            expect(dtag).toBe(versionDtag(descriptorId(content(ev))));
        }
    });

    it('the t filter and the legacy d filter return the versions the vector names', () => {
        for (const ch of ['town', 'old'] as const) {
            const want = v.expected[ch];
            const matches = (f: Record<string, unknown>) =>
                Object.entries(versions)
                    .filter(([, e]) => matchFilter(e, f as never))
                    .map(([n]) => n)
                    .sort();
            expect(matches(want.t_filter)).toEqual([...want.t_filter_matches].sort());
            expect(matches(want.legacy_d_filter)).toEqual([...want.legacy_d_filter_matches].sort());
            expect(want.legacy_d_filter['#d']).toEqual([descriptorDtag(want.channel_id)]);
        }
    });

    it('a version a supersedes names is fetched by its exact d-tag', () => {
        const w = v.expected.walk_back;
        const read = content(versions[w.read]!);
        expect(w.d_filter).toEqual({ kinds: [30110], '#d': [versionDtag(read.supersedes!)] });
        expect(matchFilter(versions[w.missing]!, w.d_filter)).toBe(true);
    });
});

type FloodCase = {
    name: string;
    versions: string[];
    relay_records: string[];
    bound_keys: Record<string, string[]>;
    reads: { from: string; filter: Record<string, unknown>; matches: string[] }[];
    expected: { tip: string; epochs: number };
};

describeVector('vc19 flood — every key the role holders bound, one per read, revoked ones included', () => {
    const v = DIR ? load('vc19-channel-version-coordinates.json') : null;
    const flood = v?.expected.flood;
    const records = (v?.inputs.records ?? {}) as Record<string, NostrEvent>;
    const versions = (v?.inputs.versions ?? {}) as Record<string, NostrEvent>;
    const addresses = (v?.inputs.addresses ?? {}) as Record<string, string>;

    /** The case's versions under the junk the vector describes. */
    function storeFor(c: FloodCase, parseableJunk = true): NostrEvent[] {
        const g = content(versions.G!) as unknown as Record<string, unknown> & { channel_id: string };
        const junk = (i: number, tags: string[][], body: string): NostrEvent => ({
            id: `${tags[1]![0]}-${i}-${body.length}`.padEnd(64, '0'),
            pubkey: 'f'.repeat(64),
            created_at: 1800000000 + i,
            kind: 30110,
            tags,
            content: body,
            sig: '0'.repeat(128),
        });
        const many = (prefix: string, tag: string[], body: (i: number) => string) =>
            Array.from({ length: 2500 }, (_, i) => junk(i, [['d', `${prefix}-${i}`], tag], body(i)));
        return [
            ...c.versions.map((n) => versions[n]!),
            ...many('t', ['t', g.channel_id], () => 'x'),
            ...many('s', ['s', descriptorId(g as never)], () => 'x'),
            ...(parseableJunk
                ? many('p', ['t', g.channel_id], (i) =>
                      JSON.stringify({ ...g, title: `junk ${i}`, supersedes: `${i}`.padStart(64, 'e') })
                  )
                : []),
        ];
    }

    for (const c of (flood?.cases ?? []) as FloodCase[]) {
        it(
            c.name,
            async () => {
                const held = c.relay_records.map((n) => records[n]!);
                const reads = readsOver(held, [], new Date());
                for (const [role, keys] of Object.entries(c.bound_keys)) {
                    expect(new Set((await reads.everBoundKeys(addresses[role]!)).keys)).toEqual(new Set(keys));
                }
                const store = storeFor(c);
                const calls: Record<string, unknown>[] = [];
                const cid = content(versions.G!).channel_id;
                const read = await readChannelVersions(
                    cid,
                    { query: relayOver(() => store, calls), everBoundKeys: reads.everBoundKeys },
                    addresses[flood.founder]
                );
                expect(read.truncated).toBe(true);
                expect(read.incomplete).toBe(false);
                const asText = (f: Record<string, unknown>) =>
                    JSON.stringify(
                        Object.keys(f)
                            .sort()
                            .map((k) => [k, f[k]])
                    );
                expect(new Set(calls.filter((f) => f.authors).map(asText))).toEqual(
                    new Set(c.reads.map((r) => asText(r.filter)))
                );
                const r = await resolveChannelChain(read.events, cid, {
                    isBound: reads.isBound,
                    liveness: reads.liveness,
                    hostKeys: async () => [],
                    verifyBip322,
                });
                expect(r?.descriptorId).toBe(descriptorId(content(versions[c.expected.tip]!)));
                expect(r?.epochs).toBe(c.expected.epochs);
            },
            60_000
        );
    }

    it('without the founder, the open read alone is cut off and the narrower reads are not made', async () => {
        const c = (flood?.cases ?? [])[0] as FloodCase;
        const store = storeFor(c, false);
        const reads = readsOver([], [], new Date());
        const read = await readChannelVersions(content(versions.G!).channel_id, {
            query: relayOver(() => store),
            everBoundKeys: reads.everBoundKeys,
        });
        expect(read.truncated).toBe(true);
        expect(read.incomplete).toBe(true);
        expect(flood.when_founder_unknown).toBe('not_read');
    }, 60_000);
});

describeVector('vc20 — earlier versions stand on their binding; the last needs a live key (SPEC §8.3.1, §8.6)', () => {
    const v = DIR ? load('vc20-channel-version-binding.json') : null;
    const now = new Date(v?.inputs.reader_now ?? 0);
    const records = (v?.inputs.records ?? {}) as Record<string, NostrEvent>;
    const versions = (v?.inputs.versions ?? {}) as Record<string, NostrEvent>;
    const addresses = (v?.inputs.addresses ?? {}) as Record<string, string>;
    const successors = (v?.inputs.successors ?? {}) as Record<string, string>;

    const resolveWith = (names: string[], relayRecords: string[], jwks?: string) => {
        const keys = (v.inputs[jwks ?? 'jwks_rotated'] as { keys: AuthHostKey[] }).keys;
        const reads = readsOver(relayRecords.map((n) => records[n]!), keys, now);
        const events = names.map((n) => versions[n]!);
        return resolveChannelChain(events, content(events[0]!).channel_id, {
            isBound: reads.isBound,
            liveness: reads.liveness,
            hostKeys: async () => keys,
            verifyBip322,
        });
    };
    const idOf = (name: string) => descriptorId(content(versions[name]!));

    it('lists every closed tip, and none a re-open superseded', async () => {
        const both = await resolveWith(
            ['FG_by_K2', 'FC1_close_by_K2', 'FC2_close_by_K2', 'FE2_edit_by_K2', 'FE1_edit_by_K2'],
            ['bind_F_K2']
        );
        expect(both?.closedTips.map((t) => t.descriptorId).sort()).toEqual(
            [idOf('FC1_close_by_K2'), idOf('FC2_close_by_K2')].sort()
        );
        const one = await resolveWith(['FG_by_K2', 'FC1_close_by_K2', 'FC2_close_by_K2', 'FR1_reopen_by_K2'], ['bind_F_K2']);
        expect(one?.closedTips.map((t) => t.descriptorId)).toEqual([idOf('FC2_close_by_K2')]);
    });

    for (const c of (v?.cases ?? []) as {
        name: string;
        versions: string[];
        relay_records: string[];
        jwks?: string;
        expected: { tip: string | null; epochs?: number; status?: string; admins?: string[]; successor?: string | null };
    }[]) {
        it(c.name, async () => {
            const r = await resolveWith(c.versions, c.relay_records, c.jwks);
            if (c.expected.tip === null) {
                expect(r).toBeNull();
                return;
            }
            expect(r?.descriptorId).toBe(idOf(c.expected.tip));
            expect(r?.epochs).toBe(c.expected.epochs);
            expect(r?.descriptor.status ?? 'active').toBe(c.expected.status);
            expect(r?.descriptor.admins).toEqual((c.expected.admins ?? []).map((a) => addresses[a]));
            if (c.expected.successor !== undefined) {
                expect(r?.descriptor.successor_channel_id ?? null).toBe(
                    c.expected.successor === null ? null : successors[c.expected.successor]
                );
            }
        });
    }
});
