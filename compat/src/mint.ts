import { exportJWK, generateKeyPair, SignJWT } from 'jose';

/**
 * Tokens are minted here at test time, from the recorded claims, with a key made for the run:
 * no token is committed, and the recorded times move to now so none has expired.
 */

const KID = 'compat-test-kid';
const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'EdDSA', use: 'sig' };

/** As ochk.io serves it at /.well-known/jwks.json. */
export const jwks = { keys: [publicJwk] };

/** As a family site holds it in OC_AUTH_PUBLIC_JWK: base64 of the JWK's JSON. */
export const publicJwkB64 = Buffer.from(JSON.stringify(publicJwk)).toString('base64');

export const ISSUER = 'https://ochk.io';

const NOW = Math.floor(Date.now() / 1000);

/** Sign `claims` as ochk.io does, keeping their lifetime and sign-in age but starting now. */
export async function mint(claims: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const { iat, exp, auth_time, iss, ...rest } = claims as Record<string, unknown> & {
        iat: number;
        exp: number;
        auth_time?: number;
    };
    if (iss !== ISSUER) throw new Error(`recorded iss ${String(iss)}`);
    const body: Record<string, unknown> = { ...rest, ...extra };
    if (typeof auth_time === 'number') body.auth_time = NOW - (iat - auth_time);
    return new SignJWT(body)
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: KID })
        .setIssuer(ISSUER)
        .setIssuedAt(NOW)
        .setExpirationTime(NOW + (exp - iat))
        .sign(keys.privateKey);
}

/** Answer auth-core's JWKS fetch, and nothing else. */
export function jwksFetch(): typeof fetch {
    return async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url !== `${ISSUER}/.well-known/jwks.json`) throw new Error(`unexpected fetch ${url}`);
        return Response.json(jwks);
    };
}
