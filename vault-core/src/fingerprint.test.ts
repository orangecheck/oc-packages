import { describe, expect, it } from 'vitest';

import { deviceFingerprint, FINGERPRINT_BYTES } from './index';

// Expected values from an independent implementation: Python's
// base64.b32encode(sha256(pk)[:10]) mapped to Crockford's alphabet.
const VECTORS: [string, string][] = [
    ['11'.repeat(32), '0BA4-K8RZ-QCK7-S3SN'],
    ['8f40c5adb68f25624ae5b214ea767a6ec94d829d3d7b5e1ad1ba6f3e2138285f', 'XVER-GFD0-N52H-B4YW'],
];
const FORM = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

describe('deviceFingerprint', () => {
    it('compares 10 bytes of the hash, not the 4 a server can match in about 2^32 tries', () => {
        expect(FINGERPRINT_BYTES).toBe(10);
        for (const [pk, fp] of VECTORS) expect(deviceFingerprint(pk)).toBe(fp);
    });

    it('is four groups of four Crockford characters, 80 bits in all', () => {
        for (const [pk] of VECTORS) {
            const fp = deviceFingerprint(pk);
            expect(fp).toMatch(FORM);
            expect(fp.replace(/-/g, '')).toHaveLength(16);
        }
        // The 0.4.x form, 4 bytes as hex.
        expect('EEDD-883D').not.toMatch(FORM);
    });

    it('changes when any byte of the key changes', () => {
        const pk = VECTORS[1]![0];
        const seen = new Set([deviceFingerprint(pk)]);
        for (let i = 0; i < pk.length; i += 2) {
            const flipped = (parseInt(pk.slice(i, i + 2), 16) ^ 1).toString(16).padStart(2, '0');
            seen.add(deviceFingerprint(pk.slice(0, i) + flipped + pk.slice(i + 2)));
        }
        expect(seen.size).toBe(33);
    });
});
