// Verify every committed test vector in oc-vote-protocol/test-vectors/.
//
// Conformance gate: canonical bytes, content-addressed ids, tally output.
// Any failure means this implementation has drifted from the spec. Most vectors'
// signatures are placeholders and tally with signatures skipped; a vector with a
// signature_check (v19-v23) carries real ones and tallies under the real verifier.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifySignature } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { canonicalBytes } from './canonical.js';
import { pollId, ballotId, revealId } from './ids.js';
import { commit } from './commit.js';
import { tally } from './tally.js';
import { verifyBallot, verifyPoll, verifyReveal } from './verify.js';
import type { SignatureVerifier } from './verify.js';
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
        /** Anchored polls (SPEC §4.6): the chain tip and H_close. */
        chain?: { tip_height: number; close_height: number | null };
        /** Anchored polls: the verified anchor height per ballot_id. */
        anchors?: Record<string, number>;
    };
    expected: {
        poll_id: string;
        poll_canonical: string;
        ballot_ids: string[];
        ballot_canonicals: string[];
        reveal_id?: string;
        reveal_canonical?: string;
        commits?: Record<string, string>;
        reveal_accepted?: boolean;
        tally_with_utxos: {
            utxo_snapshot: Record<string, Utxo[]>;
            expected_result?: TallyResult;
            expected_result_pre_reveal?: TallyResult;
            expected_result_post_reveal?: TallyResult;
        };
    };
    /** v19-v23: real signatures from a disclosed burn key, and the verdict each must get. */
    signature_check?: {
        address_type: 'p2pkh' | 'p2sh_p2wpkh' | 'p2wpkh' | 'p2tr';
        format: 'bip137' | 'bip322-simple';
        poll: SignedCheck;
        ballot: SignedCheck;
    };
}

interface SignedCheck {
    signed_message: string;
    expected: { outcome: 'ACCEPT' } | { outcome: 'REJECT'; error_code: 'E_BAD_SIG' };
}

/** The real BIP-322 verifier, never a stub that answers true. */
const realBip322: SignatureVerifier = ({ address, message, signature }) =>
    verifySignature(address, message, signature);

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
            const { poll, ballots, reveal, revealed_options, chain, anchors } = vector.inputs;
            const anchorOpts = chain
                ? {
                      closeHeight: chain.close_height,
                      tipHeight: chain.tip_height,
                      anchorHeight: (id: string) => anchors?.[id] ?? null,
                  }
                : {};
            const exp = vector.expected;
            const sc = vector.signature_check;
            const sigOpts = sc ? { verify: realBip322 } : { skipSignatures: true };

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

            if (reveal && poll.mode === 'secret') {
                it('accepts the reveal when the vector says so (SPEC §10.3)', async () => {
                    // Signatures in the vectors are placeholders; the key and the timing are what is checked.
                    const r = await verifyReveal(
                        reveal,
                        poll,
                        () => true,
                        Date.parse(poll.deadline),
                        chain ? { tipHeight: chain.tip_height, closeHeight: chain.close_height } : undefined
                    );
                    expect(r.ok).toBe(exp.reveal_accepted ?? true);
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

            if (sc) {
                const verdict = sc.ballot.expected.outcome === 'ACCEPT' ? 'takes' : 'refuses';
                it(`the real BIP-322 verifier takes the ${sc.address_type} poll and ${verdict} the ballot`, async () => {
                    expect(sc.poll.signed_message).toBe(exp.poll_id);
                    expect(sc.ballot.signed_message).toBe(exp.ballot_ids[0]);
                    const [ballot] = ballots;
                    for (const [check, r] of [
                        [sc.poll, await verifyPoll(poll, realBip322)],
                        [sc.ballot, await verifyBallot(ballot!, realBip322)],
                    ] as const) {
                        if (check.expected.outcome === 'ACCEPT') expect(r).toEqual({ ok: true });
                        else expect(r).toMatchObject({ ok: false, code: check.expected.error_code });
                    }
                });
            }

            it('tallies to the expected result', async () => {
                const utxos = exp.tally_with_utxos.utxo_snapshot;
                const utxosAt = (addr: string) => utxos[addr] ?? [];

                // Before any reveal is accepted, a secret poll awaits it (SPEC §8 step 3).
                const preExpected = exp.tally_with_utxos.expected_result_pre_reveal;
                if (preExpected) {
                    const pre = await tally({ poll, ballots, utxosAt, skipSignatures: true, ...anchorOpts });
                    expect(pre).toEqual(preExpected);
                }
                if (poll.mode === 'secret' && !revealed_options) {
                    expect(preExpected).toBeDefined();
                    return;
                }

                // A reveal the vector refuses opens nothing.
                const opened = revealed_options && exp.reveal_accepted !== false ? revealed_options : null;
                const result = await tally({
                    poll,
                    ballots,
                    utxosAt,
                    ...sigOpts,
                    ...anchorOpts,
                    ...(opened ? { revealedOptions: opened } : {}),
                });

                const expected =
                    exp.tally_with_utxos.expected_result_post_reveal ??
                    exp.tally_with_utxos.expected_result;
                expect(result).toEqual(expected);
            });
        });
    }

    it('signed vectors cover every address type, and one tampered ballot is refused', () => {
        const checks = cases.flatMap(({ vector }) => (vector.signature_check ? [vector.signature_check] : []));
        const accepted = checks
            .filter((c) => c.poll.expected.outcome === 'ACCEPT' && c.ballot.expected.outcome === 'ACCEPT')
            .map((c) => c.address_type);
        expect(new Set(accepted)).toEqual(new Set(['p2pkh', 'p2sh_p2wpkh', 'p2wpkh', 'p2tr']));
        expect(checks.some((c) => c.ballot.expected.outcome === 'REJECT')).toBe(true);
    });
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
        deadline: '2026-11-01T00:00:00.000Z',
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
        deadline: '2026-11-01T00:00:00.000Z',
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
