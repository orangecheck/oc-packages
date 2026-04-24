// Verify every committed test vector in oc-stamp-protocol/test-vectors/.
//
// Each vector is a fixed canonical-message input plus the declared envelope.
// A conformant implementation must:
//   1. Reconstruct the canonical_message byte-identical from inputs.
//   2. Compute sha256(canonical_message) and match expected.id.
//   3. Produce an envelope that verifies under the minimal path
//      (skipSignatureVerification=true, since test-vector sig.value is a
//      placeholder — real BIP-322 signatures over ECDSA are non-deterministic).

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalMessage, computeEnvelopeId } from './canonical.js';
import { verify } from './stamp.js';
import type { StampEnvelope } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR = resolve(__dirname, '..', '..', '..', 'oc-stamp-protocol', 'test-vectors');

interface Vector {
    description: string;
    inputs: {
        address: string;
        content_hash: string;
        content_length: number;
        content_mime: string;
        signed_at: string;
        content_ref: string | null;
        stake: unknown;
        ots: unknown;
        expected_sig_value: string;
    };
    expected: {
        canonical_message: string;
        canonical_message_bytes_len: number;
        id: string;
        envelope: StampEnvelope;
    };
}

async function loadVectors(): Promise<{ name: string; data: Vector }[]> {
    try {
        const files = await readdir(VECTORS_DIR);
        const out: { name: string; data: Vector }[] = [];
        for (const name of files) {
            if (!name.endsWith('.json')) continue;
            const text = await readFile(join(VECTORS_DIR, name), 'utf8');
            out.push({ name, data: JSON.parse(text) as Vector });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

const vectors = await loadVectors();

describe('oc-stamp-protocol test vectors', () => {
    if (vectors.length === 0) {
        it.skip('(no test-vectors directory found — skipping cross-implementation checks)', () => {
            /* intentionally empty */
        });
        return;
    }

    for (const { name, data } of vectors) {
        it(`${name} — canonical message reconstructs byte-identical`, () => {
            const msg = canonicalMessage({
                address: data.inputs.address,
                content_hash: data.inputs.content_hash,
                content_length: data.inputs.content_length,
                content_mime: data.inputs.content_mime,
                signed_at: data.inputs.signed_at,
            });
            expect(msg).toBe(data.expected.canonical_message);
            expect(new TextEncoder().encode(msg).byteLength).toBe(
                data.expected.canonical_message_bytes_len
            );
        });

        it(`${name} — id equals sha256(canonical_message)`, () => {
            const id = computeEnvelopeId({
                address: data.inputs.address,
                content_hash: data.inputs.content_hash,
                content_length: data.inputs.content_length,
                content_mime: data.inputs.content_mime,
                signed_at: data.inputs.signed_at,
            });
            expect(id).toBe(data.expected.id);
            expect(id).toBe(data.expected.envelope.id);
        });

        it(`${name} — declared envelope passes verify() with skipSignatureVerification`, async () => {
            const r = await verify({
                envelope: data.expected.envelope,
                skipSignatureVerification: true,
            });
            expect(r.ok).toBe(true);
        });

        it(`${name} — ${data.description}`, () => {
            // Sanity: expected sig value lines up with input.
            expect(data.expected.envelope.sig.value).toBe(data.inputs.expected_sig_value);
        });
    }
});
