import { readFileSync } from 'node:fs';

import { verify } from '@orangecheck/sdk';

import { die, exitWithJson, readStdin } from '../util';

export interface VerifyArgs {
    addr?: string;
    msg?: string;
    sig?: string;
    scheme?: 'bip322' | 'legacy';
    file?: string;
    json?: boolean;
}

/** The CLI's JSON input accepts both the compact names (`addr`, `msg`, `sig`)
 * and the longer ones (`address`, `message`, `signature`) that some callers
 * hand out — README advertises both. All fields optional at parse time;
 * we check for the resolved set below. */
interface VerifyInputShape {
    addr?: string;
    address?: string;
    msg?: string;
    message?: string;
    sig?: string;
    signature?: string;
    scheme?: 'bip322' | 'legacy';
}

async function loadJsonFromFlags(args: VerifyArgs): Promise<VerifyInputShape | null> {
    if (args.file === '-' || (!args.file && !args.addr)) {
        const raw = await readStdin();
        if (!raw.trim()) return null;
        try {
            return JSON.parse(raw);
        } catch {
            die('stdin is not valid JSON');
        }
    }
    if (args.file) {
        const raw = readFileSync(args.file, 'utf8');
        return JSON.parse(raw);
    }
    return null;
}

export async function runVerify(args: VerifyArgs): Promise<void> {
    // Accept either inline flags or a JSON envelope on stdin / file.
    const fromJson = await loadJsonFromFlags(args);

    const addr = args.addr ?? fromJson?.addr ?? fromJson?.address;
    const msg = args.msg ?? fromJson?.msg ?? fromJson?.message;
    const sig = args.sig ?? fromJson?.sig ?? fromJson?.signature;
    const scheme = args.scheme ?? fromJson?.scheme ?? 'bip322';

    if (!addr || !msg || !sig) {
        die(
            'must provide --addr / --msg / --sig, or pipe a JSON envelope with {addr|address, msg|message, sig|signature}'
        );
    }

    const outcome = await verify({ addr, msg, sig, scheme });

    if (args.json) exitWithJson(outcome, outcome.ok ? 0 : 2);

    const mark = outcome.ok ? '\u2713' : '\u2717';
    process.stdout.write(`${mark} ${outcome.ok ? 'valid' : 'invalid'}\n`);
    process.stdout.write(`  codes:   ${outcome.codes.join(', ')}\n`);
    process.stdout.write(`  network: ${outcome.network}\n`);
    if (outcome.attestation_id) {
        process.stdout.write(`  id:      ${outcome.attestation_id}\n`);
    }
    if (outcome.metrics) {
        process.stdout.write(`  sats:    ${outcome.metrics.sats_bonded.toLocaleString()}\n`);
        process.stdout.write(`  days:    ${outcome.metrics.days_unspent}\n`);
        process.stdout.write(`  score:   ${outcome.metrics.score}\n`);
    }
    if (outcome.identities?.length) {
        process.stdout.write(
            `  ids:     ${outcome.identities.map((i) => `${i.protocol}:${i.identifier}`).join(', ')}\n`
        );
    }
    process.exit(outcome.ok ? 0 : 2);
}
