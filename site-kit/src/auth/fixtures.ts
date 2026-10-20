import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { signSession } from '@orangecheck/auth-core';

/** A real Ed25519 key pair, base64url-encoded the way OC_AUTH_*_JWK are. */
export function makeKeys(kid = 'test') {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const enc = (k: object) => Buffer.from(JSON.stringify(k)).toString('base64url');
    return {
        kid,
        publicJwk: enc({ ...publicKey.export({ format: 'jwk' }), kid, alg: 'EdDSA' }),
        privateJwk: enc({ ...privateKey.export({ format: 'jwk' }), kid, alg: 'EdDSA' }),
    };
}

export type Keys = ReturnType<typeof makeKeys>;

/** A session JWT signed by `keys`, as the auth host would mint it. */
export function mint(keys: Keys, did: string, extra: Record<string, unknown> = {}, ttl = 600): Promise<string> {
    return signSession(
        { sub: `acct-${did}`, did_oc: did, jti: randomUUID(), signing_method: 'bip322', ...extra } as Parameters<
            typeof signSession
        >[0],
        { privateJwk: keys.privateJwk, publicJwk: keys.publicJwk, kid: keys.kid, issuer: 'https://ochk.io' },
        ttl
    );
}

/** A minimal Next API response that records what the handler did. */
export function recorder() {
    const out = { status: 0, headers: {} as Record<string, string>, body: undefined as unknown };
    const res = {
        setHeader(k: string, v: string) {
            out.headers[k.toLowerCase()] = String(v);
            return res;
        },
        status(s: number) {
            out.status = s;
            return res;
        },
        json(b: unknown) {
            out.body = b;
            return res;
        },
        send(b: unknown) {
            out.body = b;
            return res;
        },
    };
    return { res, out };
}
