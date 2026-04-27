// oc-vote tally <poll_id>

import { hexDecode, utf8Decode } from '@orangecheck/lock-crypto';
import { unseal } from '@orangecheck/lock-core';
import {
    ballotId,
    pollId as computePollId,
    tally,
    type Ballot,
    type Poll,
    type Reveal,
} from '@orangecheck/vote-core';

import {
    DEFAULT_RELAYS,
    fetchBallotEvents,
    fetchPollEvent,
    fetchRevealEvent,
} from '../nostr.js';
import { buildLookup, mempoolSource } from '../utxos.js';

export interface TallyOptions {
    pollId: string;
    relays?: string[];
    mempoolBase?: string;
    json?: boolean;
    verify?: boolean;
    snapshotBlock?: number;
}

export async function runTally(opts: TallyOptions): Promise<void> {
    const { pollId: pid } = opts;
    if (!/^[0-9a-f]{64}$/.test(pid)) {
        throw new Error('poll id must be 64 hex chars');
    }
    const relays = opts.relays ?? DEFAULT_RELAYS;

    const [pollEvent, ballotEvents, revealEvent] = await Promise.all([
        fetchPollEvent(pid, relays),
        fetchBallotEvents(pid, relays),
        fetchRevealEvent(pid, relays),
    ]);

    if (!pollEvent) throw new Error('poll not found on any relay');
    const poll = JSON.parse(pollEvent.content) as Poll;
    if (computePollId(poll) !== pid) {
        throw new Error('poll content does not match poll_id');
    }

    const ballots: Ballot[] = [];
    const seen = new Set<string>();
    for (const ev of ballotEvents) {
        try {
            const b = JSON.parse(ev.content) as Ballot;
            if (b.poll_id !== pid) continue;
            const id = ballotId(b);
            if (seen.has(id)) continue;
            seen.add(id);
            ballots.push(b);
        } catch {
            // skip malformed
        }
    }

    const reveal: Reveal | null = revealEvent
        ? (JSON.parse(revealEvent.content) as Reveal)
        : null;

    // Resolve snapshot
    const source = mempoolSource(opts.mempoolBase);
    const utxosAt = buildLookup(source);
    let snapshot = poll.snapshot_block;
    if (typeof snapshot !== 'number') {
        snapshot = opts.snapshotBlock ?? (await source.fetchTipHeight());
    }

    // Unseal secret-mode ballots if a reveal is published
    let revealedOptions: Record<string, string> | undefined;
    if (poll.mode === 'secret' && reveal) {
        revealedOptions = {};
        for (const b of ballots) {
            if (!b.secret) continue;
            try {
                const result = await unseal({
                    envelope: b.secret.envelope as unknown as Parameters<typeof unseal>[0]['envelope'],
                    device: { device_id: 'reveal', secretKey: hexDecode(reveal.reveal_sk) },
                    skipSenderVerification: true,
                });
                revealedOptions[b.voter] = utf8Decode(result.payload);
            } catch {
                // skip: bad envelope or wrong reveal key
            }
        }
    }

    const verify = opts.verify !== false;
    const verifyBip322 = verify
        ? async (address: string, message: string, signatureB64: string) => {
              try {
                  const mod = (await import('bip322-js')) as unknown as {
                      Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
                      default?: {
                          Verifier?: {
                              verifySignature(a: string, m: string, s: string): boolean;
                          };
                      };
                  };
                  const Verifier = mod.Verifier ?? mod.default?.Verifier;
                  if (!Verifier) return false;
                  return Verifier.verifySignature(address, message, signatureB64);
              } catch {
                  return false;
              }
          }
        : undefined;

    // Pass `snapshotBlock` rather than mutating poll.snapshot_block: the
    // poll's canonical bytes (and therefore pollId) include snapshot_block
    // verbatim, and mutating it would invalidate every ballot's poll_id.
    const result = await tally({
        poll,
        ballots,
        utxosAt,
        snapshotBlock: snapshot,
        skipSignatures: !verify,
        ...(verifyBip322 ? { verifyBip322 } : {}),
        ...(revealedOptions ? { revealedOptions } : {}),
    });

    const output = {
        poll_id: pid,
        question: poll.question,
        creator: poll.creator,
        mode: poll.mode,
        weight_mode: poll.weight_mode,
        deadline: poll.deadline,
        ballot_count: ballots.length,
        reveal_present: reveal != null,
        ...result,
    };

    if (opts.json) {
        process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        return;
    }

    // Human-readable
    const w = (s: string) => process.stdout.write(s);
    w(`\n  poll:       ${poll.question}\n`);
    w(`  poll_id:    ${pid}\n`);
    w(`  creator:    ${poll.creator}\n`);
    w(`  mode:       ${poll.mode}${poll.mode === 'secret' ? (reveal ? ' (revealed)' : ' (awaiting reveal)') : ''}\n`);
    w(`  weight:     ${poll.weight_mode}\n`);
    w(`  threshold:  ${poll.min_sats} sat / ${poll.min_days} d\n`);
    w(`  deadline:   ${poll.deadline}\n`);
    w(`  snapshot:   ${snapshot}\n`);
    w(`  ballots:    ${ballots.length}\n`);
    w(`\n`);

    if (result.state === 'awaiting_reveal') {
        w(`  STATE:      awaiting reveal — secret-mode poll, creator has not yet published reveal_sk\n\n`);
        return;
    }

    w(`  STATE:      tallied\n`);
    w(`  turnout:    ${result.turnout.voters} voters, weight ${result.turnout.weight.toLocaleString()}\n\n`);

    // Sort options by poll.options order
    const total = result.turnout.weight;
    const maxLabel = Math.max(...poll.options.map((o) => o.label.length));
    for (const opt of poll.options) {
        const wgt = result.tallies[opt.id] ?? 0;
        const pct = total > 0 ? (wgt / total) * 100 : 0;
        const barLen = total > 0 ? Math.round((wgt / total) * 30) : 0;
        const bar = '█'.repeat(barLen) + '·'.repeat(30 - barLen);
        w(`  ${opt.label.padEnd(maxLabel)}  ${bar}  ${wgt.toLocaleString().padStart(12)}  ${pct.toFixed(1).padStart(5)}%\n`);
    }
    w(`\n`);
}
