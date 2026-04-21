/**
 * @orangecheck/cli — shell interface to OrangeCheck.
 *
 *   oc check --addr bc1q... --min-sats 100000 --min-days 30
 *   oc verify --addr bc1q... --msg "..." --sig "..."
 *   oc verify < attestation.json
 *   oc discover --identity github:alice
 *   oc challenge issue --addr bc1q... --audience https://example.com
 *   oc challenge verify < signed.json
 */

import { Command } from 'commander';

import { runChallengeIssue, runChallengeVerify } from './commands/challenge';
import { runCheck } from './commands/check';
import { runDiscover } from './commands/discover';
import { runVerify } from './commands/verify';

const program = new Command();

program
    .name('oc')
    .description('OrangeCheck — proof of Bitcoin stake for the open web')
    .version('0.1.0');

program
    .command('check')
    .description('Gate on the most recent attestation for a subject')
    .option('--addr <address>', 'Bitcoin address')
    .option('--id <attestation-id>', 'Attestation ID (SHA-256 hex)')
    .option('--identity <proto:ident>', 'Identity binding, e.g. github:alice')
    .option('--min-sats <n>', 'Minimum sats bonded', '0')
    .option('--min-days <n>', 'Minimum days unspent', '0')
    .option('--json', 'Emit JSON instead of human-readable output')
    .action(async (opts) => {
        await runCheck({
            addr: opts.addr,
            id: opts.id,
            identity: opts.identity,
            minSats: opts.minSats,
            minDays: opts.minDays,
            json: Boolean(opts.json),
        });
    });

program
    .command('verify')
    .description('Verify a raw (addr, msg, sig) attestation')
    .option('--addr <address>', 'Bitcoin address')
    .option('--msg <message>', 'Canonical message (as a single string)')
    .option('--sig <signature>', 'Signature')
    .option('--scheme <s>', 'bip322 | legacy', 'bip322')
    .option('--file <path>', 'Read JSON envelope from file (use `-` for stdin)')
    .option('--json', 'Emit JSON instead of human-readable output')
    .action(async (opts) => {
        await runVerify({
            addr: opts.addr,
            msg: opts.msg,
            sig: opts.sig,
            scheme: opts.scheme,
            file: opts.file,
            json: Boolean(opts.json),
        });
    });

program
    .command('discover')
    .description('List attestations for a subject')
    .option('--addr <address>', 'Bitcoin address')
    .option('--id <attestation-id>', 'Attestation ID')
    .option('--identity <proto:ident>', 'Identity binding')
    .option('--limit <n>', 'Max attestations to return', '50')
    .option('--json', 'Emit JSON instead of human-readable output')
    .action(async (opts) => {
        await runDiscover({
            addr: opts.addr,
            id: opts.id,
            identity: opts.identity,
            limit: opts.limit,
            json: Boolean(opts.json),
        });
    });

const challenge = program
    .command('challenge')
    .description('Signed-challenge auth — prove address control');

challenge
    .command('issue')
    .description('Issue a challenge message to sign')
    .requiredOption('--addr <address>', 'Bitcoin address to challenge')
    .option('--audience <url>', 'Origin-binding URL')
    .option('--purpose <label>', 'Purpose label (e.g. login, airdrop-claim)')
    .option('--ttl <seconds>', 'TTL in seconds (30-3600)')
    .option('--json', 'Emit JSON instead of plain message')
    .action(async (opts) => {
        await runChallengeIssue({
            addr: opts.addr,
            audience: opts.audience,
            purpose: opts.purpose,
            ttl: opts.ttl,
            json: Boolean(opts.json),
        });
    });

challenge
    .command('verify')
    .description('Verify a signed challenge')
    .option('--msg <message>', 'Challenge message')
    .option('--sig <signature>', 'Signature')
    .option('--file <path>', 'Read JSON envelope from file (use `-` for stdin)')
    .option('--expected-nonce <hex>', '32 hex chars; defeats replay')
    .option('--expected-audience <url>', 'Require audience match')
    .option('--expected-purpose <label>', 'Require purpose match')
    .option('--scheme <s>', 'bip322 | legacy', 'bip322')
    .option('--json', 'Emit JSON instead of human-readable output')
    .action(async (opts) => {
        await runChallengeVerify({
            msg: opts.msg,
            sig: opts.sig,
            file: opts.file,
            expectedNonce: opts.expectedNonce,
            expectedAudience: opts.expectedAudience,
            expectedPurpose: opts.expectedPurpose,
            scheme: opts.scheme,
            json: Boolean(opts.json),
        });
    });

program.parseAsync(process.argv).catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
