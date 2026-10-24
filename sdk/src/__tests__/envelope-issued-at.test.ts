/**
 * createAttestationEnvelope() copies issued_at from the signed line verify()
 * reads, never from another line that happens to contain "issued_at: ".
 */

import { describe, expect, it } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../index';

const ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SIGNED_AT = '2026-01-01T00:00:00Z';

const base = () =>
    buildCanonicalMessage(
        { address: ADDRESS, identities: [{ protocol: 'github', identifier: 'owner' }] },
        {},
        { nonce: '0'.repeat(32), issuedAt: SIGNED_AT }
    );

const envelope = (message: string) =>
    createAttestationEnvelope(message, 'sig', 'bip322', ADDRESS, [
        { protocol: 'github', identifier: 'owner' },
    ]);

describe('createAttestationEnvelope issued_at', () => {
    it('is the signed issued_at line', async () => {
        expect((await envelope(base())).issued_at).toBe(SIGNED_AT);
    });

    it('is not a decoy issued_at inside an earlier line', async () => {
        const decoy = base().replace(
            'orangecheck\n',
            'orangecheck\nmemo: issued_at: 2099-12-31T00:00:00Z\n'
        );
        expect((await envelope(decoy)).issued_at).toBe(SIGNED_AT);
    });

    it('reads the key in any case, as verify() does, ignoring a decoy after it', async () => {
        const upper =
            base().replace('issued_at: ', 'ISSUED_AT: ') + 'zz: issued_at: 2001-01-01T00:00:00Z\n';
        expect((await envelope(upper)).issued_at).toBe(SIGNED_AT);
    });
});
