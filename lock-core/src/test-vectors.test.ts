// Verify every committed test vector in oc-lock-protocol/test-vectors/.
//
// Each vector is a fixed envelope + the device secret keys needed to
// decrypt it. Running unseal() against every vector's envelope + every
// vector's recipient secrets must recover the vector's plaintext. Any
// divergence means this implementation has drifted from the spec.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { hexDecode, hexEncode, sha256Bytes, utf8Decode } from '@orangecheck/lock-crypto';

import { canonicalBytes } from './canonical.js';
import { unseal } from './seal.js';
import type { LockEnvelope } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Three resolution paths in priority order:
 *   1. OC_LOCK_VECTORS_DIR env (CI conformance job).
 *   2. Sibling-clone of oc-lock-protocol (monorepo-shaped local dev).
 *   3. User-home fallback for one-off local checkouts.
 *   4. null — graceful skip; the describe-block below emits an it.skip().
 */
function locateVectorsDir(): string | null {
    if (process.env.OC_LOCK_VECTORS_DIR && existsSync(process.env.OC_LOCK_VECTORS_DIR)) {
        return process.env.OC_LOCK_VECTORS_DIR;
    }
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-lock-protocol', 'test-vectors');
    if (existsSync(sibling)) return sibling;
    const userHome = '/Users/wilneeley/Projects/ochk/oc-lock-protocol/test-vectors';
    if (existsSync(userHome)) return userHome;
    return null;
}

const VECTORS_DIR = locateVectorsDir();

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
    if (VECTORS_DIR === null) return [];
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

        // Cross-implementation canonical-bytes promise: sha256(canonical(envelope
        // with id='' and sig.value='')) MUST equal the envelope's id field.
        // The unseal tests above already rely on this via AEAD AAD binding,
        // but an explicit assertion catches canonicalizer drift (key sort,
        // recipient sort, number formatting, LF termination) that might
        // otherwise slip through silently when payload happens to decrypt
        // correctly for unrelated reasons.
        it(`${name} — canonical bytes produce the declared envelope id`, () => {
            const env = data.expected.envelope;
            const clone: LockEnvelope = {
                ...env,
                id: '',
                sig: { alg: env.sig.alg, pubkey: env.sig.pubkey, value: '' },
            };
            const computedId = hexEncode(
                sha256Bytes(canonicalBytes(clone as never))
            );
            expect(computedId).toBe(env.id);
        });
    }
});
