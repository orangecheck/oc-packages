/**
 * oc-airdrop — filter a candidate address list against OrangeCheck thresholds.
 *
 *   oc-airdrop filter --min-sats 100000 --min-days 30 < candidates.txt > allowlist.txt
 *
 * Reads addresses on stdin, one per line (blank lines and '#' comments ignored).
 * Writes the passing allowlist to stdout, one address per line. Rejections +
 * progress go to stderr so you can tee or redirect each stream separately.
 *
 *   # Separate rejections
 *   oc-airdrop filter --min-sats 100000 \
 *     < candidates.txt \
 *     > allowlist.txt \
 *     2> rejections.log
 */

import { createInterface } from 'node:readline';

import { filterAllowlist } from './index';

interface Args {
    minSats: number;
    minDays: number;
    concurrency: number;
    json: boolean;
    rejectOnError: boolean;
}

function requireNumber(flag: string, raw: string | undefined): number {
    if (raw === undefined) {
        process.stderr.write(`flag ${flag} requires a numeric argument\n`);
        process.exit(1);
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
        process.stderr.write(`flag ${flag} expected a non-negative number, got: ${raw}\n`);
        process.exit(1);
    }
    return n;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        minSats: 0,
        minDays: 0,
        concurrency: 4,
        json: false,
        rejectOnError: true,
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        // Validate each flag's value up-front — otherwise `--min-sats` with
        // no argument silently becomes `NaN`, which then flows into the API
        // and rejects every candidate.
        if (a === '--min-sats') args.minSats = requireNumber('--min-sats', argv[++i]);
        else if (a === '--min-days') args.minDays = requireNumber('--min-days', argv[++i]);
        else if (a === '--concurrency') {
            const n = requireNumber('--concurrency', argv[++i]);
            if (n < 1 || n > 64) {
                process.stderr.write(`--concurrency must be 1..64, got: ${n}\n`);
                process.exit(1);
            }
            args.concurrency = n;
        } else if (a === '--json') args.json = true;
        else if (a === '--allow-lookup-errors') args.rejectOnError = false;
        else if (a === '--help' || a === '-h') {
            process.stdout.write(USAGE);
            process.exit(0);
        } else if (a && a.startsWith('--')) {
            process.stderr.write(`unknown flag: ${a}\n`);
            process.exit(1);
        }
    }
    return args;
}

const USAGE = `oc-airdrop — filter a candidate list against OrangeCheck thresholds

Usage:
  oc-airdrop filter [options] < candidates.txt > allowlist.txt

Options:
  --min-sats <n>            Minimum sats bonded (default: 0)
  --min-days <n>            Minimum days unspent (default: 0)
  --concurrency <n>         Parallel checks (default: 4)
  --allow-lookup-errors     Surface SDK errors instead of rejecting
  --json                    Emit JSON report to stdout instead of plain allowlist
  -h, --help                Show this help

Stdin:  one address per line; blank lines and '#' comments ignored
Stdout: allowlist (plain) or JSON report (with --json)
Stderr: per-decision progress + final summary
`;

/** Basic shape check for a Bitcoin address. Not exhaustive (the API does
 * real validation), but rejects obviously-junk input (HTML, embedded null
 * bytes, 10 KB lines) before spending a rate-limit budget on it. */
const ADDR_SHAPE_RE =
    /^(?:bc1[a-z0-9]{11,87}|tb1[a-z0-9]{11,87}|bcrt1[a-z0-9]{11,87}|[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const MAX_ADDR_LINE_LEN = 128;

async function readAddresses(): Promise<string[]> {
    const addresses: string[] = [];
    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const raw of rl) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.length > MAX_ADDR_LINE_LEN) {
            process.stderr.write(`skip: line too long (${line.length} chars)\n`);
            continue;
        }
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x08\x0b-\x1f\x7f]/.test(line)) {
            process.stderr.write('skip: line contains control characters\n');
            continue;
        }
        if (!ADDR_SHAPE_RE.test(line)) {
            process.stderr.write(`skip: ${line.slice(0, 32)}… does not look like a BTC address\n`);
            continue;
        }
        addresses.push(line);
    }
    return addresses;
}

async function main() {
    const [, , cmd, ...rest] = process.argv;
    if (cmd !== 'filter') {
        process.stderr.write(USAGE);
        process.exit(cmd ? 1 : 0);
    }
    const args = parseArgs(rest);

    const candidates = await readAddresses();
    if (candidates.length === 0) {
        process.stderr.write('no addresses on stdin\n');
        process.exit(1);
    }

    process.stderr.write(
        `oc-airdrop: filtering ${candidates.length} candidate(s) | min_sats=${args.minSats} min_days=${args.minDays} concurrency=${args.concurrency}\n`
    );

    const result = await filterAllowlist(candidates, {
        minSats: args.minSats,
        minDays: args.minDays,
        concurrency: args.concurrency,
        rejectOnError: args.rejectOnError,
        onProgress: (done, total, last) => {
            if (!last) return;
            const mark = last.ok ? '+' : '-';
            const tail = last.ok
                ? `${last.check?.sats ?? 0} sats, ${last.check?.days ?? 0}d`
                : last.reasons.join(',');
            process.stderr.write(
                `[${String(done).padStart(String(total).length)}/${total}] ${mark} ${last.address} — ${tail}\n`
            );
        },
    });

    if (args.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    total: candidates.length,
                    passed: result.ok.length,
                    rejected: result.rejected.length,
                    allowlist: result.ok,
                    rejections: result.rejected,
                },
                null,
                2
            ) + '\n'
        );
    } else {
        for (const addr of result.ok) process.stdout.write(addr + '\n');
    }

    process.stderr.write(
        `oc-airdrop: done | ${result.ok.length} pass, ${result.rejected.length} reject\n`
    );
    process.exit(0);
}

main().catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
