import { randomBytes } from 'node:crypto';

import { exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    audienceSatisfied,
    DEFAULT_ISSUER,
    signSession,
    verifySessionToken,
    type SignConfig,
} from '../index';

/**
 * Audience-bound session tokens.
 *
 * A relying party outside the family verifies tokens minted for its own
 * origin. Two properties, both tested:
 *   - a bound token verifies only where its audience is expected
 *   - it never verifies as a family session, i.e. with no audience given —
 *     the default that keeps every family verifier unchanged
 */

let sign: SignConfig;
let publicJwk: string;

beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
        crv: 'Ed25519',
        extractable: true,
    });
    const kid = randomBytes(6).toString('base64url');
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    publicJwk = b64({ ...(await exportJWK(publicKey)), alg: 'EdDSA', use: 'sig', kid });
    sign = {
        kid,
        privateJwk: b64({ ...(await exportJWK(privateKey)), alg: 'EdDSA', use: 'sig', kid }),
        publicJwk,
        issuer: DEFAULT_ISSUER,
    };
});

const claims = { sub: 'acct_1', did_oc: 'did:oc:0123456789abcdef0123456789abcdef', jti: 'j1' };
const A = 'https://site-a.example';
const B = 'https://site-b.example';

describe('audience binding', () => {
    it('a family session (no aud) still verifies where no audience is asked for', async () => {
        const t = await signSession(claims, sign, 60);
        expect(await verifySessionToken(t, { publicJwk })).not.toBeNull();
    });

    it("a family session is refused where an integrator's audience is required", async () => {
        const t = await signSession(claims, sign, 60);
        expect(await verifySessionToken(t, { publicJwk, audience: A })).toBeNull();
    });

    it('a token bound to A verifies at A', async () => {
        const t = await signSession({ ...claims, aud: A }, sign, 60);
        const p = await verifySessionToken(t, { publicJwk, audience: A });
        expect(p?.aud).toBe(A);
    });

    it('a token bound to A is refused at B — the replay this closes', async () => {
        const t = await signSession({ ...claims, aud: A }, sign, 60);
        expect(await verifySessionToken(t, { publicJwk, audience: B })).toBeNull();
    });

    it('a token bound to A is refused as a family session', async () => {
        const t = await signSession({ ...claims, aud: A }, sign, 60);
        expect(await verifySessionToken(t, { publicJwk })).toBeNull();
    });

    it("'*' accepts both, for routes built to receive forwarded tokens", async () => {
        const family = await signSession(claims, sign, 60);
        const bound = await signSession({ ...claims, aud: A }, sign, 60);
        expect(await verifySessionToken(family, { publicJwk, audience: '*' })).not.toBeNull();
        expect(await verifySessionToken(bound, { publicJwk, audience: '*' })).not.toBeNull();
    });

    it('accepts a list of audiences', async () => {
        const t = await signSession({ ...claims, aud: B }, sign, 60);
        expect(await verifySessionToken(t, { publicJwk, audience: [A, B] })).not.toBeNull();
    });
});

describe('audienceSatisfied', () => {
    it('handles array-valued aud claims', () => {
        expect(audienceSatisfied([A, B], B)).toBe(true);
        expect(audienceSatisfied([A], B)).toBe(false);
        expect(audienceSatisfied([], undefined)).toBe(true);
        expect(audienceSatisfied([A], undefined)).toBe(false);
    });
});
