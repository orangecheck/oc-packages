/**
 * @orangecheck/vote-cli — shell interface to OC Vote.
 *
 *   oc-vote tally <poll_id>                 — run the tally function locally
 *   oc-vote verify <poll_id>                — verify every BIP-322 signature
 *   oc-vote show <poll_id>                  — print poll metadata + ballot count
 *
 * Defaults to the canonical relay set and mempool.space for UTXO snapshots.
 * Swap via --relay wss://... (repeatable) and --mempool-base https://....
 *
 * Exits non-zero if the tally is disputed (--strict-verify fails) or
 * if the poll cannot be found.
 */

import { Command } from 'commander';

import { runShow } from './commands/show.js';
import { runTally } from './commands/tally.js';
import { runVerify } from './commands/verify.js';

const program = new Command();

program
    .name('oc-vote')
    .description('OC Vote — sovereign signaling for the open web')
    .version('0.1.0');

program
    .command('tally <poll_id>')
    .description('Fetch the poll + ballots and run the pure tally function')
    .option('--relay <url>', 'Nostr relay (repeatable)', (v, prev: string[] = []) => [...prev, v], [] as string[])
    .option('--mempool-base <url>', 'mempool.space-compatible base URL', 'https://mempool.space/api')
    .option('--snapshot <height>', 'Override snapshot block (integer)')
    .option('--no-verify', 'Skip BIP-322 signature verification (faster, less safe)')
    .option('--json', 'Emit JSON instead of human-readable output')
    .action(async (pollId: string, opts: Record<string, unknown>) => {
        await runTally({
            pollId,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            mempoolBase: opts.mempoolBase as string,
            json: Boolean(opts.json),
            verify: opts.verify !== false,
            snapshotBlock: opts.snapshot ? Number.parseInt(String(opts.snapshot), 10) : undefined,
        });
    });

program
    .command('verify <poll_id>')
    .description('Verify every BIP-322 signature on the poll + its ballots')
    .option('--relay <url>', 'Nostr relay (repeatable)', (v, prev: string[] = []) => [...prev, v], [] as string[])
    .option('--json', 'Emit JSON')
    .action(async (pollId: string, opts: Record<string, unknown>) => {
        await runVerify({
            pollId,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            json: Boolean(opts.json),
        });
    });

program
    .command('show <poll_id>')
    .description('Print the poll metadata + ballot count without running the tally')
    .option('--relay <url>', 'Nostr relay (repeatable)', (v, prev: string[] = []) => [...prev, v], [] as string[])
    .option('--json', 'Emit JSON')
    .action(async (pollId: string, opts: Record<string, unknown>) => {
        await runShow({
            pollId,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            json: Boolean(opts.json),
        });
    });

program.parseAsync(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`oc-vote: ${msg}\n`);
    process.exit(1);
});
