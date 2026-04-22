/**
 * Conformance tests — SDK must agree with the normative vectors published
 * at github.com/orangecheck/oc-protocol/tree/main/conformance/vectors.
 *
 * A failure here means the SDK's output has drifted from the spec. Either
 * the spec moved (re-run `node conformance/generate.mjs` in oc-protocol and
 * re-vendor) or the SDK broke.
 *
 * Vectors are vendored under ./vectors/ so the suite runs offline. To pull
 * the latest set from the protocol repo:
 *
 *   cd packages/sdk
 *   curl -sL https://api.github.com/repos/orangecheck/oc-protocol/contents/conformance/vectors \
 *     | jq -r '.[] | .download_url' \
 *     | xargs -I{} curl -sL {} -o src/__tests__/vectors/$(basename {})
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    buildCanonicalMessage,
    computeScore,
    formatIdentities,
    generateAttestationId,
} from '../index';

const VECTORS_DIR = join(__dirname, 'vectors');

type Vector = {
    id: string;
    category: string;
    description: string;
    input: Record<string, unknown>;
    expected: Record<string, unknown>;
};

function loadVectors(): Vector[] {
    return readdirSync(VECTORS_DIR)
        .filter((f) => f.startsWith('tv') && f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(VECTORS_DIR, f), 'utf8')) as Vector);
}

function toHex(u: Uint8Array): string {
    let out = '';
    for (const b of u) out += b.toString(16).padStart(2, '0');
    return out;
}

const vectors = loadVectors();

describe('conformance: canonical message format', () => {
    for (const v of vectors.filter((x) => x.category === 'canonical_message')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                address: string;
                identities?: Array<{ protocol: string; identifier: string }>;
                extensions?: Record<string, string>;
                nonce: string;
                issued_at: string;
            };
            const msg = buildCanonicalMessage(
                { address: input.address, identities: input.identities ?? [] },
                input.extensions ?? {},
                { nonce: input.nonce, issuedAt: input.issued_at }
            );
            expect(msg).toBe(v.expected.message);
        });
    }
});

describe('conformance: identities_format', () => {
    for (const v of vectors.filter((x) => x.category === 'identities_format')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                identities: Array<{ protocol: string; identifier: string }>;
            };
            expect(formatIdentities(input.identities)).toBe(v.expected.formatted);
        });
    }
});

describe('conformance: attestation_id', () => {
    for (const v of vectors.filter((x) => x.category === 'attestation_id')) {
        it(`${v.id}: ${v.description} — sync sha256 path`, () => {
            const msg = v.input.message as string;
            // Synchronous check using @noble/hashes so the test is
            // implementation-agnostic and doesn't rely on a particular
            // platform's webcrypto availability.
            const id = toHex(sha256(new TextEncoder().encode(msg)));
            expect(id).toBe(v.expected.attestation_id);
        });

        it(`${v.id}: ${v.description} — generateAttestationId()`, async () => {
            const msg = v.input.message as string;
            const id = await generateAttestationId(msg);
            expect(id).toBe(v.expected.attestation_id);
        });
    }
});

describe('conformance: score_v0', () => {
    for (const v of vectors.filter((x) => x.category === 'score_v0')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as { sats_bonded: number; days_unspent: number };
            const score = computeScore(input.sats_bonded, input.days_unspent, {
                algorithm: 'v0',
            }) as number;
            expect(score).toBe(v.expected.score_v0);
        });
    }
});

describe('conformance: reject', () => {
    for (const v of vectors.filter((x) => x.category === 'reject')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                identities: Array<{ protocol: string; identifier: string }>;
            };
            const reason = String(v.expected.reason_contains);
            // formatIdentities is the earliest place the SDK enforces the
            // format rules — if it rejects, the whole canonical pipeline
            // rejects, so that's what we assert against.
            expect(() => formatIdentities(input.identities)).toThrowError(
                new RegExp(reason, 'i')
            );
        });
    }
});

describe('conformance: bip322_signature', () => {
    // Real BIP-322 verification via the same Verifier the production SDK
    // uses. A passing tv21/tv22 proves our verifier accepts valid sigs
    // produced by bip322-js's Signer; a passing tv23 proves we reject a
    // tampered sig on an otherwise-valid payload (no false positives).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Verifier } = require('bip322-js') as {
        Verifier: {
            verifySignature: (addr: string, msg: string, sig: string) => boolean;
        };
    };

    for (const v of vectors.filter((x) => x.category === 'bip322_signature')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                address: string;
                message: string;
                signature: string;
                scheme: string;
            };
            const expected = v.expected as { valid: boolean };
            let actual = false;
            try {
                actual = Verifier.verifySignature(input.address, input.message, input.signature);
            } catch {
                // Verifier throws on structurally-invalid sigs — counts as "not valid".
                actual = false;
            }
            expect(actual).toBe(expected.valid);
        });
    }
});

describe('conformance: vector index loaded', () => {
    it('found at least 23 vectors across every category', () => {
        expect(vectors.length).toBeGreaterThanOrEqual(23);
        const categories = new Set(vectors.map((v) => v.category));
        expect(categories).toEqual(
            new Set([
                'canonical_message',
                'identities_format',
                'attestation_id',
                'score_v0',
                'reject',
                'bip322_signature',
            ])
        );
    });
});
