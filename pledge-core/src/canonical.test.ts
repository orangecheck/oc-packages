// Inline canonical-message tests. These exist independently of the
// test-vectors harness so canonical-message drift is caught even when the
// vectors directory isn't present (e.g. consumers running this package in
// isolation).

import { describe, expect, it } from 'vitest';

import {
    canonicalAbandonmentMessage,
    canonicalOutcomeMessage,
    canonicalPledgeMessage,
    canonicalize,
    canonicalizePledgeEnvelope,
    computePledgeId,
    generateNonce,
    hexEncode,
    sha256Hex,
    validateAbandonmentInput,
    validateOutcomeInput,
    validatePledgeInput,
} from './canonical.js';
import { ENVELOPE_VERSION, type PledgeCanonicalInput } from './types.js';

const minimalPledgeInput: PledgeCanonicalInput = {
    swearer: 'bc1qalice000000000000000000000000000000000',
    proposition: 'I will not spend the bonded UTXO before block 920000.',
    resolution: {
        mechanism: 'chain_state',
        query: 'address(bc1qalice000000000000000000000000000000000).utxo_count >= 1',
    },
    resolves_at: { block: 920000 },
    expires_at: '2026-12-31T00:00:00Z',
    bond: {
        attestation_id: '1'.repeat(64),
        min_sats: 500000,
        min_days: 180,
    },
    counterparty: null,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-04-24T18:30:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
};

describe('canonicalPledgeMessage', () => {
    it('domain separator is the literal "oc-pledge/v1" on the first line', () => {
        const msg = canonicalPledgeMessage(minimalPledgeInput);
        expect(msg.split('\n')[0]).toBe('oc-pledge/v1');
    });

    it('LF-separated, no trailing LF after nonce', () => {
        const msg = canonicalPledgeMessage(minimalPledgeInput);
        expect(msg.endsWith('\n')).toBe(false);
        expect(msg.endsWith(`nonce: ${minimalPledgeInput.nonce}`)).toBe(true);
    });

    it('uses literal "null" token for null counterparty / dispute fields', () => {
        const msg = canonicalPledgeMessage(minimalPledgeInput);
        expect(msg).toContain('counterparty: null\n');
        expect(msg).toContain('dispute:\n  mechanism: null\n  params: null\n');
    });

    it('emits time:<iso> when resolves_at is time-typed; never both lines', () => {
        const msg = canonicalPledgeMessage({
            ...minimalPledgeInput,
            resolves_at: { time: '2026-09-01T00:00:00Z' },
        });
        expect(msg).toContain('resolves_at:\n  time: 2026-09-01T00:00:00Z\n');
        expect(msg).not.toContain('block:');
    });

    it('emits block:<n> when resolves_at is block-typed; never both lines', () => {
        const msg = canonicalPledgeMessage(minimalPledgeInput);
        expect(msg).toContain('resolves_at:\n  block: 920000\n');
        expect(msg).not.toContain('time:');
    });

    it('renders dispute params verbatim (single line)', () => {
        const msg = canonicalPledgeMessage({
            ...minimalPledgeInput,
            dispute: {
                mechanism: 'vote_resolves',
                params: 'poll_id=11111111111111111111111111111111;option=kept;threshold=0.5',
            },
        });
        expect(msg).toContain(
            'dispute:\n  mechanism: vote_resolves\n  params: poll_id=11111111111111111111111111111111;option=kept;threshold=0.5\n',
        );
    });

    it('encodes UTF-8 byte length matching the JS string length for ASCII inputs', () => {
        const msg = canonicalPledgeMessage(minimalPledgeInput);
        expect(new TextEncoder().encode(msg).byteLength).toBe(msg.length);
    });

    it('id is sha256 of canonical bytes, lowercase hex', () => {
        const id = computePledgeId(minimalPledgeInput);
        expect(id).toMatch(/^[0-9a-f]{64}$/);
        const bytes = new TextEncoder().encode(canonicalPledgeMessage(minimalPledgeInput));
        expect(id).toBe(sha256Hex(bytes));
    });

    it('any whitespace change in the canonical message changes the id', () => {
        const a = computePledgeId(minimalPledgeInput);
        const b = computePledgeId({
            ...minimalPledgeInput,
            proposition: minimalPledgeInput.proposition + ' ',
        });
        expect(a).not.toBe(b);
    });
});

describe('canonicalOutcomeMessage', () => {
    it('domain separator is "oc-pledge-outcome/v1"', () => {
        const msg = canonicalOutcomeMessage({
            pledge_id: 'a'.repeat(64),
            outcome: 'kept',
            resolved_at: '2026-12-15T12:00:00Z',
            resolved_by: 'deterministic',
            evidence: { mechanism: 'chain_state', result: 'true', witness: 'chain_height=1 chain_hash=' + '0'.repeat(64) },
            dispute_window_ends_at: '2026-12-22T12:00:00Z',
        });
        expect(msg.split('\n')[0]).toBe('oc-pledge-outcome/v1');
        expect(msg.endsWith('\n')).toBe(false);
    });
});

describe('canonicalAbandonmentMessage', () => {
    it('domain separator is "oc-pledge-abandonment/v1"; reason is the trailing line', () => {
        const msg = canonicalAbandonmentMessage({
            pledge_id: 'a'.repeat(64),
            abandoned_at: '2026-08-01T12:00:00Z',
            reason: 'admitting break rather than hiding',
        });
        expect(msg.split('\n')[0]).toBe('oc-pledge-abandonment/v1');
        expect(msg.endsWith('\n')).toBe(false);
        expect(msg.endsWith('reason: admitting break rather than hiding')).toBe(true);
    });
});

describe('validatePledgeInput', () => {
    it('accepts a well-formed minimal input', () => {
        expect(validatePledgeInput(minimalPledgeInput).ok).toBe(true);
    });

    it('rejects empty nonce', () => {
        const r = validatePledgeInput({ ...minimalPledgeInput, nonce: '' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/nonce/i);
    });

    it('rejects fractional-second timestamps (SPEC §0)', () => {
        const r = validatePledgeInput({
            ...minimalPledgeInput,
            sworn_at: '2026-04-24T18:30:00.123Z',
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/sworn_at|ISO|fractional/i);
    });

    it('rejects unknown resolution mechanism', () => {
        const r = validatePledgeInput({
            ...minimalPledgeInput,
            resolution: { mechanism: 'self_proof' as never, query: 'whatever' },
        });
        expect(r.ok).toBe(false);
    });

    it('requires non-null counterparty when mechanism is counterparty_signs', () => {
        const r = validatePledgeInput({
            ...minimalPledgeInput,
            resolution: {
                mechanism: 'counterparty_signs',
                query: 'counterparty(bc1qcounter000) signs outcome over pledge_id',
            },
            counterparty: null,
        });
        expect(r.ok).toBe(false);
    });

    it('rejects propositions containing LF', () => {
        const r = validatePledgeInput({ ...minimalPledgeInput, proposition: 'a\nb' });
        expect(r.ok).toBe(false);
    });
});

describe('validateOutcomeInput / validateAbandonmentInput', () => {
    it('outcome rejects non-Z timestamps', () => {
        const r = validateOutcomeInput({
            pledge_id: 'a'.repeat(64),
            outcome: 'kept',
            resolved_at: '2026-12-15T12:00:00+00:00',
            resolved_by: 'deterministic',
            evidence: { mechanism: 'chain_state', result: 'true', witness: 'witness' },
            dispute_window_ends_at: '2026-12-22T12:00:00Z',
        });
        expect(r.ok).toBe(false);
    });

    it('abandonment caps reason at 280 UTF-8 bytes', () => {
        const r = validateAbandonmentInput({
            pledge_id: 'a'.repeat(64),
            abandoned_at: '2026-08-01T12:00:00Z',
            reason: 'x'.repeat(281),
        });
        expect(r.ok).toBe(false);
    });
});

describe('canonicalize (RFC 8785)', () => {
    it('sorts keys deterministically and drops insignificant whitespace', () => {
        const a = canonicalize({ b: 1, a: 2 } as never);
        const b = canonicalize({ a: 2, b: 1 } as never);
        expect(a).toBe(b);
        expect(a).toBe('{"a":2,"b":1}');
    });

    it('emits literal null / true / false / numbers without exponents', () => {
        expect(canonicalize(null)).toBe('null');
        expect(canonicalize(true)).toBe('true');
        expect(canonicalize(false)).toBe('false');
        expect(canonicalize(42)).toBe('42');
        expect(canonicalize(0)).toBe('0');
        expect(canonicalize(-0)).toBe('0');
    });

    it('escapes control characters with \\uXXXX', () => {
        expect(canonicalize('ab')).toBe('"a\\u0001b"');
    });

    it('drops undefined object keys', () => {
        const obj = { a: 1, b: undefined } as unknown as { a: number };
        expect(canonicalize(obj as never)).toBe('{"a":1}');
    });

    it('canonicalizePledgeEnvelope is a thin wrapper over canonicalize', () => {
        const env = {
            v: ENVELOPE_VERSION,
            kind: 'pledge' as const,
            id: 'a'.repeat(64),
            swearer: { address: 'bc1q', alg: 'bip322' as const },
            proposition: 'p',
            resolution: { mechanism: 'chain_state' as const, query: 'q' },
            resolves_at: { block: 1 },
            expires_at: '2026-12-31T00:00:00Z',
            bond: { attestation_id: '0'.repeat(64), min_sats: 0, min_days: 0 },
            counterparty: null,
            dispute: { mechanism: null, params: null },
            remediation: 'breach_recorded' as const,
            sworn_at: '2026-04-24T18:30:00Z',
            nonce: '0'.repeat(32),
            sig: { alg: 'bip322' as const, pubkey: 'bc1q', value: 'AAAA' },
        };
        const out = canonicalizePledgeEnvelope(env);
        expect(out).toContain('"kind":"pledge"');
        expect(out.indexOf('"bond":')).toBeLessThan(out.indexOf('"counterparty":'));
    });
});

describe('hexEncode + generateNonce', () => {
    it('hexEncode round-trips through Uint8Array', () => {
        const bytes = new Uint8Array([0x00, 0xff, 0x10, 0xab]);
        expect(hexEncode(bytes)).toBe('00ff10ab');
    });

    it('generateNonce returns 32 lowercase hex chars', () => {
        const n = generateNonce();
        expect(n).toMatch(/^[0-9a-f]{32}$/);
    });
});
