/**
 * @orangecheck/vote-cli — shell interface to OC Vote.
 *
 *   read:
 *     oc-vote tally <poll_id>            run the pure tally function
 *     oc-vote verify <poll_id>            verify every BIP-322 signature
 *     oc-vote show <poll_id>              poll metadata + ballot count
 *     oc-vote discover                    list recent polls across relays
 *
 *   write (headless — signature via --sig or interactive paste):
 *     oc-vote create                      build + sign + publish a poll
 *     oc-vote vote                        cast a ballot (public or secret)
 *     oc-vote reveal                      publish the reveal event
 *
 *   utility:
 *     oc-vote gen-reveal-key              mint a fresh X25519 pair
 *
 * Defaults: canonical 4-relay set + mempool.space for UTXOs.
 * Swap via --relay wss://... (repeatable) and --mempool-base https://...
 */

import { Command, Option } from 'commander';

import { runCreate } from './commands/create.js';
import { runDiscover } from './commands/discover.js';
import { runGenRevealKey } from './commands/gen-reveal-key.js';
import { runReveal } from './commands/reveal.js';
import { runShow } from './commands/show.js';
import { runTally } from './commands/tally.js';
import { runVerify } from './commands/verify.js';
import { runVote } from './commands/vote.js';

const program = new Command();

function collectRelay(v: string, prev: string[] = []): string[] {
    return [...prev, v];
}

function collectOption(v: string, prev: { id: string; label: string }[] = []) {
    const [id, ...rest] = v.split(':');
    if (!id) throw new Error(`--option requires "id" or "id:label"`);
    const label = rest.length ? rest.join(':') : id;
    return [...prev, { id, label }];
}

function parseDeadline(raw: string): string {
    const rel = raw.match(/^\+(\d+)([dh])$/);
    if (rel) {
        const n = Number.parseInt(rel[1]!, 10);
        const unit = rel[2];
        const ms = (unit === 'd' ? n * 24 : n) * 3600 * 1000;
        const d = new Date(Date.now() + ms);
        return d.toISOString().replace(/\.\d+Z$/, 'Z');
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new Error(`invalid deadline: ${raw}`);
    return parsed.toISOString().replace(/\.\d+Z$/, 'Z');
}

function parseSnapshot(raw: string): number | 'deadline' {
    if (raw === 'deadline') return 'deadline';
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid snapshot block: ${raw}`);
    return n;
}

program
    .name('oc-vote')
    .description('OC Vote — sovereign signaling for the open web')
    .version('0.2.0');

// ── read ──────────────────────────────────────────────────────────────────

program
    .command('tally <poll_id>')
    .description('Fetch the poll + ballots and run the pure tally function')
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--mempool-base <url>', 'mempool.space-compatible base URL', 'https://mempool.space/api')
    .option('--snapshot <height>', 'Override snapshot block (integer)')
    .option('--no-verify', 'Skip BIP-322 signature verification')
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
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
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
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--json', 'Emit JSON')
    .action(async (pollId: string, opts: Record<string, unknown>) => {
        await runShow({
            pollId,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            json: Boolean(opts.json),
        });
    });

program
    .command('discover')
    .description('List recent polls across the default relay set')
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--limit <n>', 'max polls to return', '30')
    .option('--open-only', 'hide polls whose deadline has passed')
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
        await runDiscover({
            limit: Number.parseInt(String(opts.limit ?? '30'), 10),
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            json: Boolean(opts.json),
            openOnly: Boolean(opts.openOnly),
        });
    });

// ── write ─────────────────────────────────────────────────────────────────

program
    .command('create')
    .description('Build + sign + publish a poll')
    .requiredOption('--creator <btc-addr>', 'Bitcoin address of the poll creator')
    .requiredOption('--question <text>', 'poll question')
    .requiredOption(
        '--option <id:label>',
        'poll option; repeatable; "id" or "id:label"',
        collectOption,
        [] as { id: string; label: string }[]
    )
    .option('--deadline <iso8601 | +Nd | +Nh>', 'deadline in UTC', '+7d')
    .option('--snapshot <height | deadline>', 'snapshot block', 'deadline')
    .addOption(
        new Option('--weight-mode <mode>', 'weight function')
            .choices(['one_per_address', 'sats', 'sats_days'])
            .default('sats')
    )
    .option('--cap-days <n>', 'age cap in days (required for sats_days)', '180')
    .option('--min-sats <n>', 'minimum sat threshold', '0')
    .option('--min-days <n>', 'minimum UTXO-age threshold', '0')
    .addOption(
        new Option('--tiebreak <mode>', 'per-voter dedup rule')
            .choices(['latest', 'first'])
            .default('latest')
    )
    .addOption(
        new Option('--mode <mode>', 'ballot mode')
            .choices(['public', 'secret'])
            .default('public')
    )
    .option('--notes <text>', 'free-form notes (≤ 2048 bytes)')
    .option('--sig <base64>', 'BIP-322 signature of poll_id; prompts if omitted')
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--dry-run', 'print canonical + id; do not sign or publish')
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
        const mode = opts.mode as 'public' | 'secret';
        const weightMode = opts.weightMode as 'one_per_address' | 'sats' | 'sats_days';
        await runCreate({
            creator: String(opts.creator),
            question: String(opts.question),
            options: opts.option as { id: string; label: string }[],
            deadline: parseDeadline(String(opts.deadline)),
            snapshotBlock: parseSnapshot(String(opts.snapshot)),
            weightMode,
            capDays: weightMode === 'sats_days' ? Number.parseInt(String(opts.capDays), 10) : undefined,
            minSats: Number.parseInt(String(opts.minSats), 10),
            minDays: Number.parseInt(String(opts.minDays), 10),
            tiebreak: opts.tiebreak as 'latest' | 'first',
            mode,
            notes: opts.notes ? String(opts.notes) : undefined,
            sig: opts.sig ? String(opts.sig) : undefined,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            dryRun: Boolean(opts.dryRun),
            json: Boolean(opts.json),
        });
    });

program
    .command('vote')
    .description('Cast a ballot on a poll')
    .requiredOption('--poll <poll_id>', '64-hex poll id')
    .requiredOption('--voter <btc-addr>', 'voter Bitcoin address')
    .requiredOption('--option <id>', 'chosen option id')
    .option('--sig <base64>', 'BIP-322 signature of ballot_id; prompts if omitted')
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--dry-run', 'print canonical + id; do not sign or publish')
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
        await runVote({
            pollId: String(opts.poll),
            voter: String(opts.voter),
            option: String(opts.option),
            sig: opts.sig ? String(opts.sig) : undefined,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            dryRun: Boolean(opts.dryRun),
            json: Boolean(opts.json),
        });
    });

program
    .command('reveal')
    .description('Publish the reveal event for a secret-mode poll')
    .requiredOption('--poll <poll_id>', '64-hex poll id')
    .requiredOption('--reveal-sk <hex>', '64-hex X25519 secret key')
    .requiredOption('--creator <btc-addr>', 'poll creator address (must match the poll)')
    .option('--sig <base64>', 'BIP-322 signature of reveal_id; prompts if omitted')
    .option('--relay <url>', 'Nostr relay (repeatable)', collectRelay, [] as string[])
    .option('--force', 'publish even before deadline / even if a reveal exists')
    .option('--dry-run', 'print reveal + id; do not sign or publish')
    .option('--json', 'Emit JSON')
    .action(async (opts: Record<string, unknown>) => {
        await runReveal({
            pollId: String(opts.poll),
            revealSk: String(opts.revealSk),
            creator: String(opts.creator),
            sig: opts.sig ? String(opts.sig) : undefined,
            relays: (opts.relay as string[] | undefined)?.length ? (opts.relay as string[]) : undefined,
            force: Boolean(opts.force),
            dryRun: Boolean(opts.dryRun),
            json: Boolean(opts.json),
        });
    });

// ── utility ───────────────────────────────────────────────────────────────

program
    .command('gen-reveal-key')
    .description('Mint a fresh X25519 keypair for secret-mode polls')
    .option('--json', 'Emit JSON')
    .action((opts: Record<string, unknown>) => {
        runGenRevealKey({ json: Boolean(opts.json) });
    });

program.parseAsync(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`oc-vote: ${msg}\n`);
    process.exit(1);
});
