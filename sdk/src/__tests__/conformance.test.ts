/**
 * Conformance tests — SDK must agree with the normative vectors published
 * at github.com/orangecheck/oc-attest-protocol/tree/main/conformance/vectors.
 *
 * A failure here means the SDK's output has drifted from the spec. Either
 * the spec moved (re-run `node conformance/generate.mjs` in oc-protocol and
 * re-vendor) or the SDK broke.
 *
 * Vectors are vendored under ./vectors/ so the suite runs offline. To pull
 * the latest set from the protocol repo:
 *
 *   cd packages/sdk
 *   curl -sL https://api.github.com/repos/orangecheck/oc-attest-protocol/contents/conformance/vectors \
 *     | jq -r '.[] | .download_url' \
 *     | xargs -I{} curl -sL {} -o src/__tests__/vectors/$(basename {})
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { verifySignature } from '@orangecheck/bip322';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    bondFloors,
    bondId,
    bondNullifier,
    buildBondMessage,
    buildCanonicalMessage,
    computeScore,
    formatIdentities,
    generateAttestationId,
    parseBondMessage,
    readBondExtension,
    verifyBondSignature,
    type BondFields,
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
    // Real BIP-322 verification through the same verifier the SDK uses. A
    // passing tv21/tv22 proves it accepts valid signatures produced by
    // bip322-js's Signer; a passing tv23 proves it rejects a tampered one.
    for (const v of vectors.filter((x) => x.category === 'bip322_signature')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                address: string;
                message: string;
                signature: string;
                scheme: string;
            };
            const expected = v.expected as { valid: boolean };
            expect(verifySignature(input.address, input.message, input.signature)).toBe(
                expected.valid
            );
        });
    }
});

describe('conformance: bond_extension (SPEC §2.2)', () => {
    for (const v of vectors.filter((x) => x.category === 'bond_extension')) {
        const values = v.input.values as string[];
        const bonds = v.expected.bonds as (number | null)[];
        it(`${v.id}: ${v.description}`, () => {
            expect(values.map(readBondExtension)).toEqual(bonds);
        });
        it(`${v.id}: a signer writes only the values that give an amount`, () => {
            values.forEach((value, i) => {
                const build = () =>
                    buildCanonicalMessage(
                        { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', identities: [] },
                        { bond: value },
                        { nonce: '0011223344556677889900aabbccddee', issuedAt: '2026-04-22T12:00:00Z' }
                    );
                if (bonds[i] === null) expect(build, value).toThrow(/invalid bond/);
                else expect(build()).toContain(`\nbond: ${value}\n`);
            });
        });
    }
});

describe('conformance: bonds (BOND.md)', () => {
    const of = (c: string) => vectors.filter((x) => x.category === c);

    for (const v of of('bond_message')) {
        it(`${v.id}: ${v.description}`, () => {
            const expected = v.expected as { canonical: string; bond_id: string };
            const message = buildBondMessage(v.input as unknown as BondFields);
            expect(message).toBe(expected.canonical);
            expect(bondId(message)).toBe(expected.bond_id);
            expect(parseBondMessage(message)).toEqual(v.input);
        });
    }

    for (const v of of('bond_signature')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as {
                now?: string;
                bonds?: { message: string; signature: string }[];
                cases?: { now: string; message: string; signature: string; reason: string }[];
            };
            for (const [i, b] of (input.bonds ?? []).entries()) {
                const r = verifyBondSignature({ ...b, now: new Date(input.now!) });
                expect(r).toMatchObject({
                    ok: true,
                    bond_id: (v.expected as { bond_ids: string[] }).bond_ids[i],
                });
            }
            for (const c of input.cases ?? []) {
                const r = verifyBondSignature({ ...c, now: new Date(c.now) });
                expect(r).toEqual({ ok: false, reason: c.reason });
            }
        });
    }

    for (const v of of('bond_nullifier')) {
        it(`${v.id}: ${v.description}`, () => {
            const input = v.input as { key: string; outpoint: string; audiences: string[] };
            const key = hexToBytes(input.key);
            expect(input.audiences.map((a) => bondNullifier(key, a, input.outpoint))).toEqual(
                (v.expected as { nullifiers: string[] }).nullifiers
            );
        });
    }

    for (const v of of('bond_floors')) {
        it(`${v.id}: ${v.description}`, () => {
            const cases = (v.input as { cases: { sats: number; age_blocks: number }[] }).cases;
            expect(cases.map((c) => bondFloors(c.sats, c.age_blocks))).toEqual(
                (v.expected as { floors: unknown[] }).floors
            );
        });
    }
});

describe('conformance: vector index loaded', () => {
    it('found at least 28 vectors across every category', () => {
        expect(vectors.length).toBeGreaterThanOrEqual(28);
        const categories = new Set(vectors.map((v) => v.category));
        expect(categories).toEqual(
            new Set([
                'canonical_message',
                'identities_format',
                'attestation_id',
                'score_v0',
                'reject',
                'bip322_signature',
                'bond_message',
                'bond_signature',
                'bond_nullifier',
                'bond_floors',
                'bond_extension',
            ])
        );
    });
});
