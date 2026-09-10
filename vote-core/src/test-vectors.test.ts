// Verify every committed test vector in oc-vote-protocol/test-vectors/.
//
// Conformance gate: canonical bytes, content-addressed ids, tally output.
// Any failure means this implementation has drifted from the spec.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalBytes } from './canonical.js';
import { pollId, ballotId, revealId } from './ids.js';
import { commit } from './commit.js';
import { tally } from './tally.js';
import type { Ballot, Poll, Reveal, TallyResult, Utxo } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function locateVectorsDir(): string {
    // Env override for CI (caller checks out oc-vote-protocol wherever it likes).
    if (process.env.OC_VOTE_VECTORS_DIR && existsSync(process.env.OC_VOTE_VECTORS_DIR)) {
        return process.env.OC_VOTE_VECTORS_DIR;
    }
    // Sibling checkout preferred for monorepo dev.
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-vote-protocol', 'test-vectors');
    if (existsSync(sibling)) return sibling;
    // User-home fallback for dev environments.
    const user = '/Users/wilneeley/Projects/oc-vote-protocol/test-vectors';
    if (existsSync(user)) return user;
    throw new Error(
        'oc-vote-protocol/test-vectors not found — set OC_VOTE_VECTORS_DIR or clone the repo as a sibling'
    );
}

interface Vector {
    description: string;
    inputs: {
        poll: Poll;
        ballots: Ballot[];
        reveal?: Reveal;
        revealed_options?: Record<string, string>;
    };
    expected: {
        poll_id: string;
        poll_canonical: string;
        ballot_ids: string[];
        ballot_canonicals: string[];
        reveal_id?: string;
        reveal_canonical?: string;
        commits?: Record<string, string>;
        tally_with_utxos: {
            utxo_snapshot: Record<string, Utxo[]>;
            expected_result?: TallyResult;
            expected_result_pre_reveal?: TallyResult;
            expected_result_post_reveal?: TallyResult;
        };
    };
}

const VECTORS_DIR = locateVectorsDir();
const cases = readdirSync(VECTORS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((name) => ({
        name,
        vector: JSON.parse(readFileSync(join(VECTORS_DIR, name), 'utf8')) as Vector,
    }));

describe('oc-vote-protocol conformance', () => {
    it('finds test vectors', () => {
        expect(cases.length).toBeGreaterThanOrEqual(5);
    });

    for (const { name, vector } of cases) {
        describe(name, () => {
            const { poll, ballots, reveal, revealed_options } = vector.inputs;
            const exp = vector.expected;

            it('computes poll_id', () => {
                expect(pollId(poll)).toBe(exp.poll_id);
            });

            it('produces canonical poll bytes', () => {
                const clone = structuredClone(poll);
                clone.sig.value = '';
                expect(canonicalBytes(clone)).toBe(exp.poll_canonical);
            });

            it('computes ballot_ids', () => {
                expect(ballots.map(ballotId)).toEqual(exp.ballot_ids);
            });

            it('produces canonical ballot bytes', () => {
                const actual = ballots.map((b) => {
                    const c = structuredClone(b);
                    c.sig.value = '';
                    return canonicalBytes(c);
                });
                expect(actual).toEqual(exp.ballot_canonicals);
            });

            if (reveal && exp.reveal_id && exp.reveal_canonical) {
                it('computes reveal_id and canonical bytes', () => {
                    expect(revealId(reveal)).toBe(exp.reveal_id);
                    const c = structuredClone(reveal);
                    c.sig.value = '';
                    expect(canonicalBytes(c)).toBe(exp.reveal_canonical);
                });
            }

            if (exp.commits) {
                it('reproduces secret-mode commits', () => {
                    for (const [voter, expectedCommit] of Object.entries(exp.commits!)) {
                        const option = revealed_options?.[voter];
                        expect(option).toBeDefined();
                        expect(commit(pollId(poll), voter, option!)).toBe(expectedCommit);
                    }
                });
            }

            it('tallies to the expected result', async () => {
                const utxos = exp.tally_with_utxos.utxo_snapshot;
                const utxosAt = (addr: string) => utxos[addr] ?? [];

                if (poll.mode === 'secret' && !revealed_options) {
                    const pre = await tally({ poll, ballots, utxosAt, skipSignatures: true });
                    expect(pre).toEqual(
                        exp.tally_with_utxos.expected_result_pre_reveal ?? { state: 'awaiting_reveal' }
                    );
                    return;
                }

                const result = await tally({
                    poll,
                    ballots,
                    utxosAt,
                    skipSignatures: true,
                    ...(revealed_options ? { revealedOptions: revealed_options } : {}),
                });

                const expected =
                    exp.tally_with_utxos.expected_result_post_reveal ??
                    exp.tally_with_utxos.expected_result;
                expect(result).toEqual(expected);
            });
        });
    }
});

describe('tally requires a signature verifier', () => {
    // The library-level root cause of a shipped bug. This used to read
    // `if (!opts.skipSignatures && opts.verifyBip322)`, so a caller supplying
    // NEITHER got a tally over completely unverified ballots and no signal
    // that anything was wrong. agent-core's equivalent has always returned
    // E_BAD_SIG ("no BIP-322 verifier supplied") in the same situation —
    // vote-core was the family outlier, and the consequence shipped:
    // oc-vote-web's live poll page tallied forged ballots.
    const minimalPoll = {
        v: 0,
        kind: 'oc-vote/poll',
        creator: 'bc1qcreator00000000000000000000000000000000',
        question: 'ship?',
        options: [{ id: 'yes', label: 'yes' }],
        deadline: '2026-12-01T00:00:00.000Z',
        snapshot_block: 900000,
        weight_mode: 'sats',
        weight_params: null,
        min_sats: 0,
        min_days: 0,
        mode: 'open',
        reveal_pk: null,
        tiebreak: 'latest',
        notes: null,
        created_at: '2026-06-01T00:00:00.000Z',
        nonce: 'a'.repeat(32),
        sig: { alg: 'bip322', pubkey: 'bc1qcreator00000000000000000000000000000000', value: 'S' },
    } as unknown as Parameters<typeof tally>[0]['poll'];

    const args = { poll: minimalPoll, ballots: [], utxosAt: async () => [] };

    it('throws when given neither a verifier nor an explicit skip', async () => {
        await expect(tally({ ...args } as Parameters<typeof tally>[0])).rejects.toThrow(
            /requires a signature verifier/
        );
    });

    it('accepts an explicit skipSignatures', async () => {
        await expect(
            tally({ ...args, skipSignatures: true } as Parameters<typeof tally>[0])
        ).resolves.toBeDefined();
    });

    it('accepts the named-argument verifier', async () => {
        await expect(
            tally({ ...args, verify: async () => true } as Parameters<typeof tally>[0])
        ).resolves.toBeDefined();
    });

    it('accepts the legacy positional verifier', async () => {
        await expect(
            tally({ ...args, verifyBip322: async () => true } as Parameters<typeof tally>[0])
        ).resolves.toBeDefined();
    });
});

// SPEC §12: "Clients MUST reject polls and ballots whose `v` they do not
// support." Nothing enforced this at runtime — `v: 0` on the interfaces is a
// compile-time literal, and a poll parsed from a relay event carries whatever
// integer the publisher wrote.
describe('tally rejects versions it does not support (SPEC §12)', () => {
    const basePoll = {
        v: 0,
        kind: 'oc-vote/poll',
        creator: 'bc1qcreator00000000000000000000000000000000',
        question: 'ship?',
        options: [{ id: 'yes', label: 'yes' }],
        deadline: '2026-12-01T00:00:00.000Z',
        snapshot_block: 900000,
        weight_mode: 'sats',
        weight_params: null,
        min_sats: 0,
        min_days: 0,
        mode: 'open',
        reveal_pk: null,
        tiebreak: 'latest',
        notes: null,
        created_at: '2026-06-01T00:00:00.000Z',
        nonce: 'a'.repeat(32),
        sig: { alg: 'bip322', pubkey: 'bc1qcreator00000000000000000000000000000000', value: 'S' },
    };

    it('throws on a poll version it does not speak', async () => {
        await expect(
            tally({
                poll: { ...basePoll, v: 1 },
                ballots: [],
                utxosAt: async () => [],
                skipSignatures: true,
            } as unknown as Parameters<typeof tally>[0])
        ).rejects.toThrow(/poll v=1 not supported/);
    });

    it('still tallies the supported poll version', async () => {
        await expect(
            tally({
                poll: basePoll,
                ballots: [],
                utxosAt: async () => [],
                skipSignatures: true,
            } as unknown as Parameters<typeof tally>[0])
        ).resolves.toBeDefined();
    });

    // A ballot on an unknown version is DROPPED, not thrown: one publisher on a
    // format we do not speak must not void everyone else's tally.
    it('drops a future-version ballot without voiding the tally', async () => {
        const pid = pollId(basePoll as unknown as Parameters<typeof pollId>[0]);
        const mkBallot = (v: number, voter: string) => ({
            v,
            kind: 'oc-vote/ballot',
            poll_id: pid,
            voter,
            option: 'yes',
            attestation_id: null,
            secret: null,
            created_at: '2026-06-02T00:00:00.000Z',
            sig: { alg: 'bip322', pubkey: voter, value: 'S' },
        });
        const utxosAt = async (addr: string) =>
            addr === 'bc1qgood' || addr === 'bc1qfuture'
                ? [{ value: 100_000, confirmed_height: 899_000 }]
                : [];

        const r = await tally({
            poll: basePoll,
            ballots: [mkBallot(0, 'bc1qgood'), mkBallot(1, 'bc1qfuture')],
            utxosAt,
            skipSignatures: true,
        } as unknown as Parameters<typeof tally>[0]);

        // The v0 ballot counted; the v1 one did not.
        expect(r.state).toBe('tallied');
        expect((r as { turnout: { voters: number } }).turnout.voters).toBe(1);
        expect((r as { tallies: Record<string, number> }).tallies.yes).toBeGreaterThan(0);
    });
});
