/**
 * CLI command tests. Each subcommand is exercised end-to-end against a
 * mocked @orangecheck/sdk. We spy on process.exit so runCommand() doesn't
 * actually terminate the vitest runner; stdout/stderr are captured so we
 * can assert on the rendered output shape.
 *
 * What this covers:
 *   - check / verify / discover / challenge happy paths
 *   - --json flag uses the machine-readable shape
 *   - exit codes are correct (0 pass, 2 deny, 1 error) per the documented contract
 *   - bad-input guards (missing required flags) produce exit 1 and a stderr message
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({
    check: vi.fn(),
    verify: vi.fn(),
    issueChallenge: vi.fn(),
    verifyChallenge: vi.fn(),
    discoverAttestations: vi.fn(),
    getAttestationsForAddress: vi.fn(),
    getAttestationsForIdentity: vi.fn(),
}));

import * as sdk from '@orangecheck/sdk';

import { runCheck } from '../commands/check';
import { runChallengeIssue } from '../commands/challenge';
import { runDiscover } from '../commands/discover';
import { runVerify } from '../commands/verify';

class ExitCalled extends Error {
    constructor(public code: number) {
        super(`process.exit(${code})`);
    }
}

let stdout: string;
let stderr: string;
let exitSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    stdout = '';
    stderr = '';
    // Tell util.readStdin() there's no piped input so verify/challenge don't
    // hang waiting on stdin during the "no-args" error-path tests.
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    // Replace process.exit with a throw so tests can catch + assert.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
        throw new ExitCalled(Number(code ?? 0));
    }) as never;
    stdoutSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: unknown) => {
            stdout += String(chunk);
            return true;
        }) as never;
    stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: unknown) => {
            stderr += String(chunk);
            return true;
        }) as never;
});

afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.mocked(sdk.check).mockReset();
    vi.mocked(sdk.verify).mockReset();
    vi.mocked(sdk.issueChallenge).mockReset();
    vi.mocked(sdk.discoverAttestations).mockReset();
    vi.mocked(sdk.getAttestationsForAddress).mockReset();
});

async function expectExit(fn: () => Promise<void>): Promise<number> {
    try {
        await fn();
    } catch (e) {
        if (e instanceof ExitCalled) return e.code;
        throw e;
    }
    throw new Error('expected process.exit to be called, but runner returned normally');
}

describe('oc check', () => {
    it('exits 0 on a passing check and renders sats/days/score', async () => {
        vi.mocked(sdk.check).mockResolvedValue({
            ok: true,
            sats: 100_000,
            days: 30,
            score: 23.03,
            attestation_id: 'a'.repeat(64),
        } as never);
        const code = await expectExit(() => runCheck({ addr: 'bc1qtest' }));
        expect(code).toBe(0);
        expect(stdout).toMatch(/✓\s+pass/);
        expect(stdout).toMatch(/sats:\s+100,000/);
        expect(stdout).toMatch(/days:\s+30/);
    });

    it('exits 2 on a failing check (deny, not error)', async () => {
        vi.mocked(sdk.check).mockResolvedValue({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['not_found'],
        } as never);
        const code = await expectExit(() => runCheck({ addr: 'bc1qtest' }));
        expect(code).toBe(2);
        expect(stdout).toMatch(/✗\s+fail/);
        expect(stdout).toMatch(/reasons: not_found/);
    });

    it('--json emits valid JSON and uses the same 0/2 exit codes', async () => {
        vi.mocked(sdk.check).mockResolvedValue({
            ok: true,
            sats: 100,
            days: 1,
            score: 4.6,
        } as never);
        const code = await expectExit(() => runCheck({ addr: 'bc1qtest', json: true }));
        expect(code).toBe(0);
        const parsed = JSON.parse(stdout);
        expect(parsed.ok).toBe(true);
        expect(parsed.sats).toBe(100);
    });

    it('exits 1 and prints to stderr when no subject is provided', async () => {
        const code = await expectExit(() => runCheck({}));
        expect(code).toBe(1);
        expect(stderr).toMatch(/must provide --addr, --id, or --identity/);
    });
});

describe('oc verify', () => {
    it('passes inline flags through to verify()', async () => {
        vi.mocked(sdk.verify).mockResolvedValue({
            ok: true,
            codes: ['sig_ok_bip322', 'bond_confirmed'],
            network: 'mainnet',
            attestation_id: 'b'.repeat(64),
            identities: [{ protocol: 'github', identifier: 'alice' }],
            metrics: { sats_bonded: 100, days_unspent: 1, score: 4.6 },
        } as never);
        const code = await expectExit(() =>
            runVerify({
                addr: 'bc1qtest',
                msg: 'orangecheck\n...',
                sig: 'sigdata',
                json: true,
            })
        );
        expect(code).toBe(0);
        const body = JSON.parse(stdout);
        expect(body.ok).toBe(true);
        expect(body.codes).toContain('sig_ok_bip322');
        expect(vi.mocked(sdk.verify)).toHaveBeenCalledWith({
            addr: 'bc1qtest',
            msg: 'orangecheck\n...',
            sig: 'sigdata',
            scheme: 'bip322',
        });
    });

    it('bails out with 1 when none of --addr / --msg / --sig are provided', async () => {
        const code = await expectExit(() => runVerify({}));
        expect(code).toBe(1);
        expect(stderr).toMatch(/must provide --addr/);
    });
});

describe('oc challenge issue', () => {
    it('writes the message to stdout, the nonce to stderr', async () => {
        vi.mocked(sdk.issueChallenge).mockReturnValue({
            message: 'orangecheck-auth\nnonce: abc\n...',
            nonce: 'abc',
            expiresAt: Date.now() + 1000,
            expiresAtIso: '2026-04-22T12:00:00Z',
        } as never);
        const code = await expectExit(() => runChallengeIssue({ addr: 'bc1qtest' }));
        expect(code).toBe(0);
        expect(stdout).toContain('orangecheck-auth');
        expect(stderr).toMatch(/nonce:/i);
    });
});

describe('oc discover', () => {
    it('renders the attestation list when results exist', async () => {
        vi.mocked(sdk.getAttestationsForAddress).mockResolvedValue([
            {
                attestation_id: 'a'.repeat(64),
                address: 'bc1qtest',
                scheme: 'bip322',
                identities: [{ protocol: 'github', identifier: 'alice' }],
                issued_at: '2026-04-22T00:00:00Z',
            },
        ] as never);
        const code = await expectExit(() => runDiscover({ addr: 'bc1qtest' }));
        expect(code).toBe(0);
        expect(stdout).toMatch(/1 of 1 attestation/);
        expect(stdout).toMatch(/github:alice/);
    });

    it('exits 0 with a friendly message when no attestations found', async () => {
        vi.mocked(sdk.getAttestationsForAddress).mockResolvedValue([] as never);
        const code = await expectExit(() => runDiscover({ addr: 'bc1qtest' }));
        expect(code).toBe(0);
        expect(stdout).toMatch(/no attestations found/);
    });
});
