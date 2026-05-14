import { randomBytes } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    clearSessionCookieHeader,
    DEFAULT_ISSUER,
    readSessionCookie,
    serializeSessionCookie,
    signSession,
    verifySessionToken,
    verifyStepUpClaim,
    type SessionPayload,
    type SignConfig,
    type VerifyConfig,
} from '../index';

async function freshKeys() {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
        crv: 'Ed25519',
        extractable: true,
    });
    const kid = randomBytes(6).toString('base64url');
    const privJwk = { ...(await exportJWK(privateKey)), alg: 'EdDSA', use: 'sig', kid };
    const pubJwk = { ...(await exportJWK(publicKey)), alg: 'EdDSA', use: 'sig', kid };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return {
        kid,
        privateJwk: b64(privJwk),
        publicJwk: b64(pubJwk),
        privateKey,
    };
}

describe('sign / verify round-trip', () => {
    let sign: SignConfig;
    let verify: VerifyConfig;

    beforeAll(async () => {
        const k = await freshKeys();
        sign = { kid: k.kid, privateJwk: k.privateJwk, publicJwk: k.publicJwk, issuer: DEFAULT_ISSUER };
        verify = { publicJwk: k.publicJwk, issuer: DEFAULT_ISSUER };
    });

    it('verifies a token signed with the matching private key', async () => {
        const tok = await signSession(
            { sub: 'acct-123', did_oc: 'did:oc:abc', jti: 'deadbeef' },
            sign,
            3600
        );
        const payload = await verifySessionToken(tok, verify);
        expect(payload?.sub).toBe('acct-123');
        expect(payload?.did_oc).toBe('did:oc:abc');
        expect(payload?.jti).toBe('deadbeef');
    });

    it('rejects a token signed by a different key', async () => {
        const other = await freshKeys();
        const tok = await signSession(
            { sub: 'a', did_oc: 'did:oc:abc', jti: 'j' },
            { ...sign, privateJwk: other.privateJwk, kid: other.kid },
            3600
        );
        expect(await verifySessionToken(tok, verify)).toBeNull();
    });

    it('rejects a token with wrong issuer', async () => {
        const tok = await signSession(
            { sub: 'a', did_oc: 'did:oc:abc', jti: 'j' },
            { ...sign, issuer: 'https://evil.example.com' },
            3600
        );
        expect(await verifySessionToken(tok, verify)).toBeNull();
    });

    it('round-trips the home_federation claim', async () => {
        const tok = await signSession(
            {
                sub: 'acct-123',
                did_oc: 'did:oc:abc',
                jti: 'jti-1',
                home_federation: 'oc-me-v1',
            },
            sign,
            3600
        );
        const payload = await verifySessionToken(tok, verify);
        expect(payload?.home_federation).toBe('oc-me-v1');
    });

    it('omits home_federation when not provided (back-compat)', async () => {
        const tok = await signSession(
            { sub: 'acct-123', did_oc: 'did:oc:abc', jti: 'jti-2' },
            sign,
            3600
        );
        const payload = await verifySessionToken(tok, verify);
        expect(payload?.home_federation).toBeUndefined();
    });

    it('round-trips the signing_method claim', async () => {
        const tok = await signSession(
            {
                sub: 'acct-123',
                did_oc: 'did:oc:abc',
                jti: 'jti-3',
                signing_method: 'fedimint_threshold',
            },
            sign,
            3600
        );
        const payload = await verifySessionToken(tok, verify);
        expect(payload?.signing_method).toBe('fedimint_threshold');
    });

    it('omits signing_method when not provided (back-compat)', async () => {
        const tok = await signSession(
            { sub: 'acct-123', did_oc: 'did:oc:abc', jti: 'jti-4' },
            sign,
            3600
        );
        const payload = await verifySessionToken(tok, verify);
        expect(payload?.signing_method).toBeUndefined();
    });

    it('rejects an expired token', async () => {
        const k = await freshKeys();
        const now = Math.floor(Date.now() / 1000);
        const tok = await new SignJWT({ sub: 'a', did_oc: 'did:oc:abc', jti: 'j' })
            .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: k.kid })
            .setIssuer(DEFAULT_ISSUER)
            .setIssuedAt(now - 7200)
            .setExpirationTime(now - 3600)
            .sign(k.privateKey);
        expect(await verifySessionToken(tok, { publicJwk: k.publicJwk })).toBeNull();
    });
});

describe('cookie helpers', () => {
    it('serializes with HttpOnly, SameSite=Lax, Secure, Path=/ by default', () => {
        const h = serializeSessionCookie('abc', { maxAge: 1000 });
        expect(h).toContain('oc_session=abc');
        expect(h).toContain('HttpOnly');
        expect(h).toContain('SameSite=Lax');
        expect(h).toContain('Secure');
        expect(h).toContain('Path=/');
        expect(h).toContain('Max-Age=1000');
    });

    it('applies a Domain attribute when given', () => {
        expect(serializeSessionCookie('abc', { domain: '.ochk.io' })).toContain('Domain=.ochk.io');
    });

    it('clearSessionCookieHeader produces a Max-Age=0 cookie', () => {
        const h = clearSessionCookieHeader({ domain: '.ochk.io' });
        expect(h).toContain('oc_session=');
        expect(h).toContain('Max-Age=0');
        expect(h).toContain('Domain=.ochk.io');
    });

    it('readSessionCookie extracts the token from a Cookie: header', () => {
        expect(readSessionCookie('foo=bar; oc_session=xyz; baz=qux')).toBe('xyz');
        expect(readSessionCookie('foo=bar')).toBeNull();
        expect(readSessionCookie(null)).toBeNull();
        expect(readSessionCookie('oc_session=')).toBeNull();
    });
});

describe('verifyStepUpClaim', () => {
    const base: SessionPayload = {
        sub: 'acc',
        did_oc: 'did:oc:0',
        jti: 'j',
    };

    it('returns false when the claim is missing', () => {
        expect(verifyStepUpClaim(base, { max_age_secs: 300 })).toBe(false);
    });

    it('returns true for a fresh step_up_at', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifyStepUpClaim({ ...base, step_up_at: now }, { max_age_secs: 300 })).toBe(true);
        expect(verifyStepUpClaim({ ...base, step_up_at: now - 30 }, { max_age_secs: 300 })).toBe(true);
    });

    it('returns false for a stale step_up_at', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifyStepUpClaim({ ...base, step_up_at: now - 301 }, { max_age_secs: 300 })).toBe(
            false
        );
        expect(verifyStepUpClaim({ ...base, step_up_at: now - 3600 }, { max_age_secs: 300 })).toBe(
            false
        );
    });

    it('returns false for a future-dated step_up_at (clock-skew or malicious mint)', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifyStepUpClaim({ ...base, step_up_at: now + 60 }, { max_age_secs: 300 })).toBe(
            false
        );
    });

    it('returns false for non-positive or non-finite freshness windows', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifyStepUpClaim({ ...base, step_up_at: now }, { max_age_secs: 0 })).toBe(false);
        expect(verifyStepUpClaim({ ...base, step_up_at: now }, { max_age_secs: -1 })).toBe(false);
    });

    it('returns false for malformed step_up_at values', () => {
        expect(verifyStepUpClaim({ ...base, step_up_at: NaN }, { max_age_secs: 300 })).toBe(false);
        expect(
            verifyStepUpClaim(
                { ...base, step_up_at: Number.POSITIVE_INFINITY },
                { max_age_secs: 300 }
            )
        ).toBe(false);
    });
});
