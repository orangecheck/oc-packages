/**
 * @orangecheck/stamp-cli — shell interface to OC Stamp.
 *
 *   stamp file <path>              — sign a file, optionally anchor
 *   stamp verify <stamp> [content] — full SPEC §8 verification
 *   stamp anchor <stamp>           — submit/re-submit to OTS calendars
 *   stamp canonical <path>         — print the canonical message (dry run)
 *
 * Git aliases (same binary, invoked as `git-stamp`):
 *
 *   git-stamp tag <tagname>        — stamp a git tag
 *   git-stamp verify <tagname>     — verify the stored stamp for a tag
 *
 * The `stamp` and `git-stamp` binaries share this entrypoint — we dispatch
 * on argv[1] basename so each alias shows only its relevant subcommands in
 * --help.
 */

import { basename } from 'node:path';

import { Command } from 'commander';

import { runAnchor } from './commands/anchor.js';
import { runGitTag, runGitVerify } from './commands/git-tag.js';
import { runStampFile } from './commands/stamp-file.js';
import { runVerify } from './commands/verify.js';

import { canonicalMessage } from '@orangecheck/stamp-core';
import { hashFile, mimeFromPath } from './util.js';

const invoked = basename(process.argv[1] ?? 'stamp');

const program = new Command();

if (invoked.startsWith('git-stamp')) {
    // git-stamp alias: narrow, tag-focused surface.
    program
        .name('git-stamp')
        .description('Stamp git tags with your Bitcoin address, anchored to Bitcoin.')
        .version('0.1.0');

    program
        .command('tag <tagname>')
        .description('Sign and (optionally) anchor a stamp over <tagname>^{tree}')
        .requiredOption('--addr <address>', 'Bitcoin address')
        .option('--sig <signature>', 'BIP-322 signature (non-interactive mode)')
        .option('--no-anchor', 'Skip OTS calendar submission')
        .option('--json', 'Emit JSON')
        .action(async (tag, opts) => {
            await runGitTag({
                tag,
                address: opts.addr,
                sig: opts.sig,
                anchor: Boolean(opts.anchor),
                json: Boolean(opts.json),
            });
        });

    program
        .command('verify <tagname>')
        .description('Verify the stamp stored under .git/stamps/<tagname>.stamp')
        .option('--require-anchor', 'Fail unless the OTS proof is confirmed')
        .option('--json', 'Emit JSON')
        .action(async (tag, opts) => {
            await runGitVerify({
                tag,
                requireAnchor: Boolean(opts.requireAnchor),
                json: Boolean(opts.json),
            });
        });
} else {
    program
        .name('stamp')
        .description('OC Stamp — sign anything with your Bitcoin address, anchor to Bitcoin.')
        .version('0.1.0');

    program
        .command('file <path>')
        .description('Sign a file and write <path>.stamp alongside')
        .requiredOption('--addr <address>', 'Bitcoin address')
        .option('--mime <type>', 'Override the MIME type (default: inferred from extension)')
        .option('--signed-at <iso>', 'Override signed_at (default: now)')
        .option('--sig <signature>', 'BIP-322 signature (non-interactive mode)')
        .option('--no-anchor', 'Skip OTS calendar submission')
        .option('--out <path>', 'Output path (default: <path>.stamp)')
        .option('--json', 'Emit JSON')
        .action(async (path, opts) => {
            await runStampFile({
                path,
                address: opts.addr,
                mime: opts.mime,
                signedAt: opts.signedAt,
                sig: opts.sig,
                anchor: Boolean(opts.anchor),
                out: opts.out,
                json: Boolean(opts.json),
            });
        });

    program
        .command('verify <stamp> [content]')
        .description('Run the full SPEC §8 verification')
        .option('--require-anchor', 'Fail unless the OTS proof is confirmed')
        .option('--skip-signature', 'Skip BIP-322 verification (for CI smoke tests only)')
        .option('--json', 'Emit JSON')
        .action(async (stampPath, contentPath, opts) => {
            await runVerify({
                stampPath,
                contentPath,
                requireAnchor: Boolean(opts.requireAnchor),
                skipSignature: Boolean(opts.skipSignature),
                json: Boolean(opts.json),
            });
        });

    program
        .command('anchor <stamp>')
        .description('Submit an existing stamp envelope to OTS calendars')
        .option('--json', 'Emit JSON')
        .action(async (stampPath, opts) => {
            await runAnchor({ stampPath, json: Boolean(opts.json) });
        });

    program
        .command('canonical <path>')
        .description('Print the canonical message a stamp over <path> would sign (dry run)')
        .requiredOption('--addr <address>', 'Bitcoin address')
        .option('--mime <type>', 'Override the MIME type')
        .option('--signed-at <iso>', 'Override signed_at (default: now)')
        .action(async (path, opts) => {
            const { hash, length } = await hashFile(path);
            const msg = canonicalMessage({
                address: opts.addr,
                content_hash: hash,
                content_length: length,
                content_mime: opts.mime ?? mimeFromPath(path),
                signed_at: opts.signedAt ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
            });
            process.stdout.write(msg);
            // No trailing newline — the canonical message itself has no trailing
            // LF after signed_at, and users pipe this directly into signing tools.
        });
}

program.parseAsync(process.argv).catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
