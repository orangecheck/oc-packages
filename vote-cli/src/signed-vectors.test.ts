// oc-vote-protocol's signed vectors (v19-v24: a poll and a ballot signed by one
// disclosed burn key per address type, v23 with one byte of the ballot's
// signature flipped, v24 with one byte of the poll's) through the CLI's own paths: the poll lookup every command
// makes, `oc-vote verify`'s ballot verdicts, the read-back that decides a poll or
// ballot is published, and the count. A BIP-322 simple signature is tried again
// with the finalized BIP's `smp` prefix.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { matchFilter, type Filter, type QueryResult } from '@orangecheck/nostr-core';
import type { Ballot, Poll, TallyResult, Utxo } from '@orangecheck/vote-core';
import { describe, expect, it } from 'vitest';

import { ballotVerdicts } from './ballots.js';
import { bip322Verify } from './bip322.js';
import { computeTally } from './commands/tally.js';
import { buildBallotEvent, buildPollEvent } from './events.js';
import type { NostrEvent } from './nostr.js';
import { relaysServingBallot, relaysServingPoll } from './quorum.js';
import { selectPoll } from './select.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** OC_VOTE_VECTORS_DIR (CI checks the spec out), else a sibling clone of oc-vote-protocol. */
function vectorsDir(): string | null {
    const env = process.env.OC_VOTE_VECTORS_DIR;
    if (env && existsSync(env)) return env;
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-vote-protocol', 'test-vectors');
    return existsSync(sibling) ? sibling : null;
}

type Outcome = { outcome: 'ACCEPT' } | { outcome: 'REJECT'; error_code: string };

interface SignedVector {
    name: string;
    poll: Poll;
    ballot: Ballot;
    ballotId: string;
    utxos: Record<string, Utxo[]>;
    /** The count's result, or the code it refuses the poll with (v24). */
    result: TallyResult | null;
    error: string | null;
    check: {
        address_type: string;
        format: 'bip137' | 'bip322-simple';
        poll: { expected: Outcome };
        ballot: { expected: Outcome };
    };
}

const DIR = vectorsDir();
const VECTORS: SignedVector[] = DIR
    ? readdirSync(DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .flatMap((name) => {
              const d = JSON.parse(readFileSync(join(DIR, name), 'utf8'));
              if (!d.signature_check) return [];
              const { utxo_snapshot: utxos, expected_result: result, expected_error: error } = d.expected.tally_with_utxos;
              return [
                  {
                      name,
                      poll: d.inputs.poll,
                      ballot: d.inputs.ballots[0],
                      ballotId: d.expected.ballot_ids[0],
                      utxos,
                      result: result ?? null,
                      error: error ?? null,
                      check: d.signature_check,
                  },
              ];
          })
    : [];

const smp = <T extends Poll | Ballot>(o: T): T => ({ ...o, sig: { ...o.sig, value: `smp${o.sig.value}` } });

/** The poll and ballot as the vector holds them and, for the simple form, `smp`-prefixed. */
function forms(v: SignedVector): Array<[string, Poll, Ballot]> {
    return v.check.format === 'bip322-simple'
        ? [
              ['as signed', v.poll, v.ballot],
              ['smp-prefixed', smp(v.poll), smp(v.ballot)],
          ]
        : [['as signed', v.poll, v.ballot]];
}

/** One in-memory relay that serves `held` to every query it matches. */
function relayHolding(held: NostrEvent[]) {
    const relay = 'wss://held.example';
    return {
        relays: [relay],
        query: async (filter: Filter, asked: readonly string[]): Promise<QueryResult> => {
            const events = held.filter((e) => matchFilter(e, filter));
            const relayStatus = asked.map((r) => ({ relay: r, ok: true, eose: true, events: events.length, rejected: 0 }));
            return { events, relayStatus };
        },
    };
}

describe('signed vectors through the CLI', () => {
    it('finds the signed vectors, which CI checks out', () => {
        if (!DIR && !process.env.CI) return;
        const accepted = VECTORS.filter(
            (v) => v.check.poll.expected.outcome === 'ACCEPT' && v.check.ballot.expected.outcome === 'ACCEPT'
        );
        expect(new Set(accepted.map((v) => v.check.address_type))).toEqual(
            new Set(['p2pkh', 'p2sh_p2wpkh', 'p2wpkh', 'p2tr'])
        );
        expect(VECTORS.some((v) => v.check.ballot.expected.outcome === 'REJECT')).toBe(true);
    });

    for (const v of VECTORS) {
        const pollOk = v.check.poll.expected.outcome === 'ACCEPT';
        const ballotOk = v.check.ballot.expected.outcome === 'ACCEPT';
        for (const [form, poll, ballot] of forms(v)) {
            const label = `${v.name} (${v.check.address_type}, ${form})`;
            const pid = v.ballot.poll_id;

            it(`the poll lookup ${pollOk ? 'takes' : 'refuses'} the poll of ${label}`, async () => {
                const selected = await selectPoll([buildPollEvent(poll)], pid, bip322Verify);
                expect(selected).toMatchObject({ signatureValid: pollOk });
            });

            it(`oc-vote verify ${ballotOk ? 'takes' : 'refuses'} the ballot of ${label}`, () => {
                expect(ballotVerdicts([ballot])).toEqual([{ voter: ballot.voter, ballot_id: v.ballotId, ok: ballotOk }]);
            });

            it(`the read-back ${ballotOk ? 'counts' : 'refuses'} a relay serving the ballot of ${label}`, async () => {
                const read = relayHolding([buildPollEvent(poll), buildBallotEvent(ballot)]);
                expect(await relaysServingPoll(poll, read)).toEqual(pollOk ? read.relays : []);
                expect(await relaysServingBallot(ballot, read)).toEqual(ballotOk ? read.relays : []);
            });

            it(`the count ${v.error ? `refuses ${label} with ${v.error}` : `gives ${label} the vector's result`}`, async () => {
                const count = computeTally({
                    poll,
                    ballots: [ballot],
                    reveal: null,
                    utxosAt: (addr: string) => v.utxos[addr] ?? [],
                    verify: bip322Verify,
                });
                if (v.error) await expect(count).rejects.toMatchObject({ code: v.error });
                else expect(await count).toEqual(v.result);
            });
        }
    }
});
