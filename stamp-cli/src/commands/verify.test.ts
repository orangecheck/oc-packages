import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    base64Encode,
    blockHashOf,
    hexDecode,
    hexEncode,
    serializeTimestamp,
    type OtsTimestamp,
} from '@orangecheck/stamp-ots';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { runVerify } from './verify';

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

// id --sha256--> root, attested at HEIGHT; the header carries root at offset 36.
const HEIGHT = 900_000;
const idBytes = hexDecode(ENVELOPE.id);
const root = new Uint8Array(createHash('sha256').update(idBytes).digest());
const proof: OtsTimestamp = {
    msg: idBytes,
    attestations: [],
    ops: [{ op: { kind: 'sha256' }, child: { msg: root, attestations: [{ kind: 'bitcoin', height: HEIGHT }], ops: [] } }],
};
const header = new Uint8Array(80);
header.set(root, 36);
// Same height, another Merkle root: a header that was read and does not match.
const otherHeader = new Uint8Array(80);
otherHeader.fill(7, 36, 68);

function stampFile(blockHash: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'stamp-cli-verify-'));
    const path = join(dir, 'x.stamp');
    const ots = {
        status: 'confirmed',
        proof: base64Encode(serializeTimestamp(proof)),
        calendars: ['https://alice.btc.calendar.opentimestamps.org'],
        block_height: HEIGHT,
        block_hash: blockHash,
        upgraded_at: '2026-09-24T00:00:00Z',
    };
    writeFileSync(path, JSON.stringify({ ...ENVELOPE, ots }) + '\n');
    return path;
}

type Mode = 'ok' | 'down' | 'missing' | 'other';
let mode: Mode = 'ok';
let server: Server;
let base = '';

beforeAll(async () => {
    server = createServer((req, res) => {
        const served = mode === 'other' ? otherHeader : header;
        if (mode === 'down') return void res.writeHead(503).end('Service Unavailable');
        if (mode === 'missing') return void res.writeHead(404).end('Block not found');
        if (req.url === `/block-height/${HEIGHT}`) return void res.end(blockHashOf(served));
        if (req.url === `/block/${blockHashOf(served)}/header`) return void res.end(hexEncode(served));
        res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => vi.restoreAllMocks());

class Exit extends Error {
    constructor(readonly code: number) {
        super(`exit ${code}`);
    }
}

/** Run `stamp verify --skip-signature --json` and return its exit code and output. */
async function run(opts: { mode: Mode; requireAnchor: boolean; blockHash?: string; headersUrl?: string }) {
    mode = opts.mode;
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => void lines.push(s));
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        throw new Exit(c ?? 0);
    }) as never);
    let code = 0;
    try {
        await runVerify({
            stampPath: stampFile(opts.blockHash ?? blockHashOf(header)),
            requireAnchor: opts.requireAnchor,
            skipSignature: true,
            headersUrl: opts.headersUrl ?? base,
            json: true,
        });
    } catch (e) {
        if (!(e instanceof Exit)) throw e;
        code = e.code;
    }
    return { code, out: JSON.parse(lines.join('\n')) as Record<string, unknown> };
}

describe('stamp verify, anchor states', () => {
    it('passes --require-anchor when the proof chains to the header that was read', async () => {
        const r = await run({ mode: 'ok', requireAnchor: true });
        expect(r.code).toBe(0);
        expect(r.out).toMatchObject({ ok: true, anchor_state: 'anchored' });
    });

    it('exits 3, not E_BAD_ANCHOR, when the header source answers 503', async () => {
        const r = await run({ mode: 'down', requireAnchor: true });
        expect(r.code).toBe(3);
        expect(r.out).toMatchObject({ ok: false, code: 'ANCHOR_UNCHECKED', block_height: HEIGHT });
        expect(String(r.out.message)).toMatch(/HTTP 503/);
    });

    it('exits 3 when the header source cannot be reached at all', async () => {
        const closed = createServer();
        await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
        const port = (closed.address() as AddressInfo).port;
        await new Promise<void>((r) => closed.close(() => r()));
        const r = await run({ mode: 'ok', requireAnchor: true, headersUrl: `http://127.0.0.1:${port}` });
        expect(r.code).toBe(3);
        expect(r.out.code).toBe('ANCHOR_UNCHECKED');
    });

    it('verifies the rest and reports the anchor unchecked on a 503 without --require-anchor', async () => {
        const r = await run({ mode: 'down', requireAnchor: false });
        expect(r.code).toBe(0);
        expect(r.out).toMatchObject({ ok: true, anchor_state: 'unchecked' });
        expect(String(r.out.anchor)).toMatch(/couldn't check/);
    });

    it('fails E_BAD_ANCHOR when the explorer has no block at the claimed height', async () => {
        const r = await run({ mode: 'missing', requireAnchor: true });
        expect(r.code).toBe(2);
        expect(r.out.code).toBe('E_BAD_ANCHOR');
    });

    it('fails E_BAD_ANCHOR when the header read carries another Merkle root', async () => {
        const r = await run({ mode: 'other', requireAnchor: true, blockHash: blockHashOf(otherHeader) });
        expect(r.code).toBe(2);
        expect(r.out.code).toBe('E_BAD_ANCHOR');
    });

    it('fails E_BAD_ANCHOR when the header read does not hash to the claimed block', async () => {
        const r = await run({ mode: 'ok', requireAnchor: true, blockHash: '00'.repeat(32) });
        expect(r.code).toBe(2);
        expect(r.out.code).toBe('E_BAD_ANCHOR');
    });
});
