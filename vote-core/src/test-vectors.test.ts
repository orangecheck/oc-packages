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
    // Sibling checkout preferred for monorepo dev.
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-vote-protocol', 'test-vectors');
    if (existsSync(sibling)) return sibling;
    // User-home fallback for dev environments.
    const user = '/Users/wilneeley/Projects/oc-vote-protocol/test-vectors';
    if (existsSync(user)) return user;
    throw new Error('oc-vote-protocol/test-vectors not found');
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
