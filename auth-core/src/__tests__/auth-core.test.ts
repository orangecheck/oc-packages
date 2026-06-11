import { randomBytes } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    clearSessionCookieHeader,
    DEFAULT_ISSUER,
    readAllSessionCookies,
    readSessionCookie,
    resolveSessionFromRequest,
    serializeSessionCookie,
    signSession,
    TAB_SESSION_HEADER,
    verifySessionToken,
    verifyStepUpClaim,
    verifySudoClaim,
    resolveDisplayIdentity,
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

    it('readAllSessionCookies returns every oc_session value in order', () => {
        expect(readAllSessionCookies('oc_session=a; foo=bar; oc_session=b')).toEqual(['a', 'b']);
        expect(readAllSessionCookies('foo=bar')).toEqual([]);
        expect(readAllSessionCookies(null)).toEqual([]);
        expect(readAllSessionCookies('oc_session=')).toEqual([]);
    });
});

describe('resolveSessionFromRequest (per-tab pinning)', () => {
    let sign: SignConfig;
    let verify: VerifyConfig;

    beforeAll(async () => {
        const k = await freshKeys();
        sign = { kid: k.kid, privateJwk: k.privateJwk, publicJwk: k.publicJwk, issuer: DEFAULT_ISSUER };
        verify = { publicJwk: k.publicJwk, issuer: DEFAULT_ISSUER };
    });

    const mint = (sub: string, didOc: string) =>
        signSession({ sub, did_oc: didOc, jti: `jti-${sub}` }, sign, 3600);

    it('prefers a valid tab header over the cookie', async () => {
        const cookieTok = await mint('acct-cookie', 'did:oc:c0ffee');
        const tabTok = await mint('acct-tab', 'did:oc:7ab7ab');
        const res = await resolveSessionFromRequest(
            { cookie: `oc_session=${cookieTok}`, [TAB_SESSION_HEADER]: tabTok },
            verify
        );
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.via).toBe('tab');
            expect(res.payload.did_oc).toBe('did:oc:7ab7ab');
        }
    });

    it('fails CLOSED on an invalid tab header — never falls back to the cookie', async () => {
        const cookieTok = await mint('acct-cookie', 'did:oc:c0ffee');
        const res = await resolveSessionFromRequest(
            { cookie: `oc_session=${cookieTok}`, [TAB_SESSION_HEADER]: 'garbage.token.value' },
            verify
        );
        expect(res).toEqual({ ok: false, reason: 'tab_invalid' });
    });

    it('falls back to the cookie jar when no tab header is present', async () => {
        const cookieTok = await mint('acct-cookie', 'did:oc:c0ffee');
        const res = await resolveSessionFromRequest(
            { cookie: `oc_session=stale-garbage; oc_session=${cookieTok}` },
            verify
        );
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.via).toBe('cookie');
            expect(res.payload.did_oc).toBe('did:oc:c0ffee');
        }
    });

    it('resolves no_session with neither header', async () => {
        expect(await resolveSessionFromRequest({}, verify)).toEqual({
            ok: false,
            reason: 'no_session',
        });
    });

    it('accepts a Web Headers object', async () => {
        const tabTok = await mint('acct-tab', 'did:oc:7ab7ab');
        const res = await resolveSessionFromRequest(
            new Headers({ [TAB_SESSION_HEADER]: tabTok }),
            verify
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.via).toBe('tab');
    });

    it('accepts Node-style string[] header values', async () => {
        const tabTok = await mint('acct-tab', 'did:oc:7ab7ab');
        const res = await resolveSessionFromRequest(
            { [TAB_SESSION_HEADER]: [tabTok] },
            verify
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.payload.did_oc).toBe('did:oc:7ab7ab');
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

describe('verifySudoClaim', () => {
    const base: SessionPayload = {
        sub: 'acc',
        did_oc: 'did:oc:0',
        jti: 'j',
    };

    it('returns false when sudo_at is missing', () => {
        expect(verifySudoClaim(base, { max_age_secs: 300 })).toBe(false);
    });

    it('returns true for a fresh sudo_at', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifySudoClaim({ ...base, sudo_at: now }, { max_age_secs: 300 })).toBe(true);
        expect(verifySudoClaim({ ...base, sudo_at: now - 30 }, { max_age_secs: 300 })).toBe(true);
    });

    it('returns false for a stale sudo_at', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifySudoClaim({ ...base, sudo_at: now - 301 }, { max_age_secs: 300 })).toBe(false);
    });

    it('returns false for a future-dated sudo_at', () => {
        const now = Math.floor(Date.now() / 1000);
        expect(verifySudoClaim({ ...base, sudo_at: now + 60 }, { max_age_secs: 300 })).toBe(false);
    });

    it('returns false for malformed sudo_at values', () => {
        expect(verifySudoClaim({ ...base, sudo_at: NaN }, { max_age_secs: 300 })).toBe(false);
        expect(
            verifySudoClaim({ ...base, sudo_at: Number.POSITIVE_INFINITY }, { max_age_secs: 300 })
        ).toBe(false);
    });

    it('is independent of step_up_at', () => {
        const now = Math.floor(Date.now() / 1000);
        // step_up_at fresh, sudo_at absent → sudo says false
        expect(verifySudoClaim({ ...base, step_up_at: now }, { max_age_secs: 300 })).toBe(false);
        // sudo_at fresh, step_up_at absent → sudo says true
        expect(verifySudoClaim({ ...base, sudo_at: now }, { max_age_secs: 300 })).toBe(true);
    });
});

describe('resolveDisplayIdentity', () => {
    const base: SessionPayload = {
        sub: 'acc',
        did_oc: 'did:oc:abc123',
        jti: 'j',
    };

    it('falls back to the did when the claim is absent', () => {
        expect(resolveDisplayIdentity(base)).toEqual({ kind: 'did', value: 'did:oc:abc123' });
    });

    it('falls back to the did when the claim is explicitly null', () => {
        expect(resolveDisplayIdentity({ ...base, display_identity: null })).toEqual({
            kind: 'did',
            value: 'did:oc:abc123',
        });
    });

    it('returns a well-formed claim verbatim', () => {
        for (const id of [
            { kind: 'btc' as const, value: 'bc1qexampleaddr' },
            { kind: 'email' as const, value: 'me@example.com' },
            { kind: 'nostr' as const, value: 'npub1example' },
            { kind: 'did' as const, value: 'did:oc:abc123' },
        ]) {
            expect(resolveDisplayIdentity({ ...base, display_identity: id })).toEqual(id);
        }
    });

    it('falls back to the did for a malformed claim', () => {
        const malformed = [
            { kind: 'btc', value: '' },
            { kind: 'twitter', value: '@x' },
            { kind: 'btc' },
            { value: 'bc1q' },
            'btc',
            42,
        ];
        for (const bad of malformed) {
            expect(
                resolveDisplayIdentity({ ...base, display_identity: bad as never })
            ).toEqual({ kind: 'did', value: 'did:oc:abc123' });
        }
    });
});
