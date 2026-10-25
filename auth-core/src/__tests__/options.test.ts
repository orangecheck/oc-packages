import { randomBytes } from 'node:crypto';

import { exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    createRevocationCheck,
    DEFAULT_ISSUER,
    getOcSession,
    integratorRevocationCheck,
    resolveSessionFromRequest,
    signSession,
    verifyOcToken,
    verifySessionToken,
    type SignConfig,
    type VerifyConfig,
    type VerifyOcOptions,
} from '../index';

/**
 * The verifiers, the signer and the revocation checks refuse an option they
 * do not read. A misspelt `audience` would otherwise read as no audience, which
 * accepts family sessions; a misspelt `projectKey` would leave the revocation
 * check off.
 */

let sign: SignConfig;
let token: string;

beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const kid = randomBytes(6).toString('base64url');
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    sign = {
        kid,
        privateJwk: b64({ ...(await exportJWK(privateKey)), alg: 'EdDSA', use: 'sig', kid }),
        publicJwk: b64({ ...(await exportJWK(publicKey)), alg: 'EdDSA', use: 'sig', kid }),
        issuer: DEFAULT_ISSUER,
    };
    token = await signSession({ sub: 'acct', did_oc: 'did:oc:x', jti: 'j1' }, sign, 600);
});

const noToken = { cookie: null, authorization: null };
const misspelt = { audiance: 'https://site.example' } as unknown as VerifyOcOptions;

describe('unknown options', () => {
    it('verifyOcToken and getOcSession refuse a misspelt audience instead of reading it as none', async () => {
        await expect(verifyOcToken(token, misspelt)).rejects.toThrow(TypeError);
        await expect(verifyOcToken(token, misspelt)).rejects.toThrow(/unknown option audiance/);
        await expect(getOcSession(noToken, misspelt)).rejects.toThrow(/unknown option audiance/);
    });

    it('verifySessionToken and resolveSessionFromRequest refuse one too', async () => {
        const cfg = { publicJwk: sign.publicJwk, audiance: 'https://site.example' } as unknown as VerifyConfig;
        await expect(verifySessionToken(token, cfg)).rejects.toThrow(/unknown option audiance/);
        await expect(resolveSessionFromRequest({ cookie: `oc_session=${token}` }, cfg)).rejects.toThrow(
            /unknown option audiance/
        );
    });

    it('signSession refuses an audience in the config, which it never read: the audience is claims.aud', async () => {
        await expect(
            signSession({ sub: 'a', did_oc: 'did:oc:x', jti: 'j' }, { ...sign, audience: 'https://site.example' }, 60)
        ).rejects.toThrow(/claims\.aud/);
        await expect(
            signSession({ sub: 'a', did_oc: 'did:oc:x', jti: 'j' }, { ...sign, kidd: 'x' } as unknown as SignConfig, 60)
        ).rejects.toThrow(/unknown option kidd/);
    });

    it('the revocation checks refuse a misspelt key instead of turning themselves off', () => {
        expect(() => integratorRevocationCheck({ projectkey: 'pk_live_x' } as never)).toThrow(/unknown option projectkey/);
        expect(() => createRevocationCheck({ tokn: 'secret' } as never)).toThrow(/unknown option tokn/);
    });

    it('refuse a known option the caller did not set, one read through the prototype', async () => {
        const inherited = Object.create({ audience: 'https://site.example' }) as VerifyOcOptions;
        await expect(verifyOcToken(token, inherited)).rejects.toThrow(/option audience is inherited/);
        await expect(getOcSession(noToken, inherited)).rejects.toThrow(/option audience is inherited/);
        const cfg = Object.assign(Object.create({ issuer: 'https://elsewhere.example' }), { publicJwk: sign.publicJwk });
        await expect(verifySessionToken(token, cfg)).rejects.toThrow(/option issuer is inherited/);
        expect(() => integratorRevocationCheck(Object.create({ projectKey: 'pk_live_x' }))).toThrow(/inherited/);
    });

    it('every option they read is accepted', async () => {
        const known: VerifyOcOptions = {
            issuer: DEFAULT_ISSUER,
            jwksCacheTtlMs: 1000,
            jwksMaxStaleMs: 1000,
            audience: 'https://site.example',
        };
        await expect(getOcSession(noToken, known)).resolves.toBeNull();
        const cfg: VerifyConfig = { publicJwk: sign.publicJwk, issuer: DEFAULT_ISSUER, audience: undefined };
        await expect(verifySessionToken(token, cfg)).resolves.toMatchObject({ did_oc: 'did:oc:x' });
        await expect(resolveSessionFromRequest({ cookie: `oc_session=${token}` }, cfg)).resolves.toMatchObject({
            ok: true,
        });
        expect(() =>
            integratorRevocationCheck({ projectKey: 'pk', signingSecret: 's', meOrigin: 'https://me.example', ttlMs: 1 })
        ).not.toThrow();
        expect(() => createRevocationCheck({ url: 'https://x.example', token: 't', ttlMs: 1, developing: true })).not.toThrow();
    });

    it('me-client 0.38.2 and earlier pass their own options through: those keys are accepted and ignored', async () => {
        const passedThrough = {
            audience: 'https://site.example',
            method: 'GET',
            projectKey: 'pk_live_x',
            meOrigin: 'https://me.ochk.io',
            revocation: false,
            required: true,
            requireBond: { minSats: 1 },
        } as unknown as VerifyOcOptions;
        await expect(getOcSession(noToken, passedThrough)).resolves.toBeNull();
    });
});
