import { readFileSync } from 'node:fs';

import { issueChallenge, verifyChallenge } from '@orangecheck/sdk';

import { die, exitWithJson, readStdin } from '../util';

export interface ChallengeIssueArgs {
    addr: string;
    audience?: string;
    purpose?: string;
    ttl?: string;
    json?: boolean;
}

export async function runChallengeIssue(args: ChallengeIssueArgs): Promise<void> {
    if (!args.addr) die('--addr is required');
    const c = issueChallenge({
        address: args.addr,
        ttlSeconds: args.ttl ? Number(args.ttl) : undefined,
        audience: args.audience,
        purpose: args.purpose,
    });

    if (args.json) {
        exitWithJson({
            message: c.message,
            nonce: c.nonce,
            expiresAt: c.expiresAt,
            expiresAtIso: c.expiresAtIso,
        });
    }

    // Default: print the signable message to stdout, metadata to stderr.
    process.stderr.write(
        `# nonce: ${c.nonce}\n# expires: ${c.expiresAtIso}\n# sign the following message with BIP-322:\n`
    );
    process.stdout.write(c.message);
    process.exit(0);
}

export interface ChallengeVerifyArgs {
    msg?: string;
    sig?: string;
    file?: string;
    expectedNonce?: string;
    expectedAudience?: string;
    expectedPurpose?: string;
    scheme?: 'bip322' | 'legacy';
    json?: boolean;
}

interface VerifyInputShape {
    message: string;
    signature: string;
    scheme?: 'bip322' | 'legacy';
    expectedNonce?: string;
    expectedAudience?: string;
    expectedPurpose?: string;
}

async function loadJson(args: ChallengeVerifyArgs): Promise<VerifyInputShape | null> {
    if (args.file === '-' || (!args.file && !args.msg)) {
        const raw = await readStdin();
        if (!raw.trim()) return null;
        try {
            return JSON.parse(raw);
        } catch {
            die('stdin is not valid JSON');
        }
    }
    if (args.file) {
        return JSON.parse(readFileSync(args.file, 'utf8'));
    }
    return null;
}

export async function runChallengeVerify(args: ChallengeVerifyArgs): Promise<void> {
    const fromJson = await loadJson(args);

    const message = args.msg ?? fromJson?.message;
    const signature = args.sig ?? fromJson?.signature;
    if (!message || !signature) {
        die('must provide --msg and --sig, or pipe a JSON envelope with {message, signature}');
    }

    const result = await verifyChallenge({
        message,
        signature,
        scheme: args.scheme ?? fromJson?.scheme ?? 'bip322',
        expectedNonce: args.expectedNonce ?? fromJson?.expectedNonce,
        expectedAudience: args.expectedAudience ?? fromJson?.expectedAudience,
        expectedPurpose: args.expectedPurpose ?? fromJson?.expectedPurpose,
    });

    if (args.json) exitWithJson(result, result.ok ? 0 : 2);

    const mark = result.ok ? '\u2713' : '\u2717';
    process.stdout.write(`${mark} ${result.reason}\n`);
    if (result.ok) {
        process.stdout.write(`  address:  ${result.address}\n`);
        process.stdout.write(`  nonce:    ${result.nonce}\n`);
        if (result.audience) process.stdout.write(`  audience: ${result.audience}\n`);
        if (result.purpose) process.stdout.write(`  purpose:  ${result.purpose}\n`);
    }
    process.exit(result.ok ? 0 : 2);
}
