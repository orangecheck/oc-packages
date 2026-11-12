// `stamp anchor -` reads the stamp from stdin and writes it, advanced or not, to
// stdout, so the summary goes to stderr. A path is rewritten in place on change.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type { StampEnvelope } from '@orangecheck/stamp-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAnchor } from './anchor';

// The calendars are not asked: advanceOts hands back a pending proof.
vi.mock('../anchor-check.js', () => ({
    advanceOts: async (e: StampEnvelope) => ({ ...e, ots: { ...PENDING } }),
    otsFailure: () => 'unreachable',
}));

// oc-stamp-protocol test-vectors/v01-minimal.json (placeholder signature).
const ENVELOPE = {
    v: 1,
    kind: 'stamp',
    id: 'ad30c983dfc872a8c53cd70eb4d84e1869967a4b8433586beec7ba468b03c3de',
    content: {
        hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        length: 42,
        mime: 'text/plain',
        ref: null,
    },
    signer: { address: 'bc1qalice000000000000000000000000000000000', alg: 'bip322' },
    signed_at: '2026-04-24T18:30:00Z',
    stake: null,
    ots: null,
    sig: { alg: 'bip322', pubkey: 'bc1qalice000000000000000000000000000000000', value: 'ZmFrZS1zaWduYXR1cmU=' },
};
const PENDING = {
    status: 'pending',
    proof: 'AA==',
    calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    block_height: null,
    block_hash: null,
    upgraded_at: null,
};
const CONFIRMED = {
    status: 'confirmed',
    proof: 'AA==',
    calendars: ['https://alice.btc.calendar.opentimestamps.org'],
    block_height: 900_000,
    block_hash: '00'.repeat(32),
    upgraded_at: '2026-09-24T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

async function anchor(stampPath: string, stdin?: string) {
    const out: string[] = [];
    const log: string[] = [];
    const err: string[] = [];
    if (stdin !== undefined) vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from([stdin]) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => void out.push(s)) as never);
    vi.spyOn(console, 'log').mockImplementation((s: string) => void log.push(s));
    vi.spyOn(console, 'error').mockImplementation((s: string) => void err.push(s));
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        throw new Error(`exit ${c}`);
    }) as never);
    await runAnchor({ stampPath, json: true });
    return { out: out.join(''), log: log.join('\n'), err: err.join('\n') };
}

describe('stamp anchor -', () => {
    it('writes the advanced stamp to stdout and the summary to stderr', async () => {
        const r = await anchor('-', JSON.stringify(ENVELOPE));
        expect(JSON.parse(r.out)).toEqual({ ...ENVELOPE, ots: PENDING });
        expect(r.log).toBe('');
        expect(JSON.parse(r.err)).toMatchObject({ ok: true, status: 'pending', written: 'stdout' });
    });

    it('writes a confirmed stamp to stdout as it is', async () => {
        const confirmed = { ...ENVELOPE, ots: CONFIRMED };
        const r = await anchor('-', JSON.stringify(confirmed));
        expect(JSON.parse(r.out)).toEqual(confirmed);
        expect(r.log).toBe('');
        expect(JSON.parse(r.err)).toMatchObject({ ok: true, already: 'confirmed', block_height: 900_000 });
    });

    it('rewrites a path in place and prints the summary to stdout', async () => {
        const path = join(mkdtempSync(join(tmpdir(), 'stamp-cli-anchor-')), 'x.stamp');
        writeFileSync(path, JSON.stringify(ENVELOPE) + '\n');
        const r = await anchor(path);
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ ...ENVELOPE, ots: PENDING });
        expect(r.out).toBe('');
        expect(JSON.parse(r.log)).toMatchObject({ ok: true, status: 'pending', written: path });
    });
});
