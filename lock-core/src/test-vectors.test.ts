// Verify every committed test vector in oc-lock-protocol/test-vectors/.
//
// Each vector is a fixed envelope + the device secret keys needed to
// decrypt it. Running unseal() against every vector's envelope + every
// vector's recipient secrets must recover the vector's plaintext. Any
// divergence means this implementation has drifted from the spec.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hexDecode, utf8Decode } from '@orangecheck/lock-crypto';

import { unseal } from './seal.js';
import type { LockEnvelope } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR = resolve(__dirname, '..', '..', '..', 'oc-lock-protocol', 'test-vectors');

interface VectorRecipient {
    address: string;
    device_id: string;
    device_pk: string;
    device_sk: string;
}

interface Vector {
    description: string;
    inputs: {
        plaintext: string;
        recipients: VectorRecipient[];
        expected_sig_value: string;
    };
    expected: {
        envelope: LockEnvelope;
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

describe('oc-lock-protocol test vectors', () => {
    if (vectors.length === 0) {
        it.skip('(no test-vectors directory found — skipping cross-implementation checks)', () => {
            /* intentionally empty */
        });
        return;
    }

    for (const { name, data } of vectors) {
        it(`${name} — ${data.description}`, async () => {
            for (const recipient of data.inputs.recipients) {
                const out = await unseal({
                    envelope: data.expected.envelope,
                    device: {
                        device_id: recipient.device_id,
                        secretKey: hexDecode(recipient.device_sk),
                    },
                    skipSenderVerification: true,
                });
                expect(utf8Decode(out.payload)).toBe(data.inputs.plaintext);
                expect(out.sender.address).toBe(data.expected.envelope.from.address);
            }
            expect(data.expected.envelope.sig.value).toBe(data.inputs.expected_sig_value);
        });
    }
});
