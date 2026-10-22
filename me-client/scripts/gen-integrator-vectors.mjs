#!/usr/bin/env node
// Writes test-vectors/integrator.json: sign-in tokens, event signatures and
// webhook signatures that the Node SDK and the Python SDK (sdk-py) must both
// accept or refuse the same way. Ed25519 and HMAC are deterministic, so
// running this again changes nothing unless the inputs below change.
//
//   node scripts/gen-integrator-vectors.mjs
import { createHash, createHmac, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SignJWT } from 'jose';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-vectors', 'integrator.json');

/** An Ed25519 key from a fixed 32-byte seed, so every run signs the same bytes. */
function keyFromSeed(seedHex, kid) {
    const der = Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(seedHex, 'hex'),
    ]);
    const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    const { x } = createPublicKey(privateKey).export({ format: 'jwk' });
    return { privateKey, jwk: { kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig', kid, x } };
}

const NOW = 1_800_000_000; // the clock both test suites set
const ISSUER = 'https://ochk.io';
const SITE = 'https://soniq.example';
const DID = 'did:oc:0123456789abcdef0123456789abcdef';

const session = keyFromSeed('11'.repeat(32), 'tv-session-1');
const stranger = keyFromSeed('22'.repeat(32), 'tv-session-1');
const hook = keyFromSeed('33'.repeat(32), 'tv-webhook-1');
// A rotated-out key: ochk.io keeps publishing it, marked retired.
const old = keyFromSeed('44'.repeat(32), 'tv-session-0');
const RETIRED_AT = NOW - 3600;

async function jwt(claims, { key = session.privateKey, kid = 'tv-session-1' } = {}) {
    const { aud, ...rest } = claims;
    const t = new SignJWT(rest).setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid });
    if (aud !== undefined) t.setAudience(aud);
    return t.sign(key);
}

const base = {
    sub: '6f1c2a5e-0000-4000-8000-000000000001',
    did_oc: DID,
    jti: 'tv-jti-1',
    iss: ISSUER,
    iat: NOW - 60,
    exp: NOW + 3600,
    aud: SITE,
};
const drop = (o, k) => Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));

const good = await jwt(base);
const [h, p] = good.split('.');
const tamperedPayload = Buffer.from(
    JSON.stringify({ ...base, did_oc: 'did:oc:ffffffffffffffffffffffffffffffff' })
).toString('base64url');
const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: 'tv-session-1' })).toString('base64url')}.${p}.`;

const sessionVectors = {
    issuer: ISSUER,
    jwks: { keys: [session.jwk, { ...old.jwk, status: 'retired', retired_at: RETIRED_AT }] },
    valid: [
        { name: 'bound to this site', token: good, audience: SITE, claims: drop(base, 'iss') },
        {
            name: 'carries a revocation handle',
            token: await jwt({ ...base, jti: 'tv-jti-rh', rh: 'tv-rh-0001' }),
            audience: SITE,
            claims: { ...drop(base, 'iss'), jti: 'tv-jti-rh', rh: 'tv-rh-0001' },
        },
        {
            name: 'carries a coin backing claim',
            token: await jwt({ ...base, jti: 'tv-jti-2', oc_bond: { v: 1, sats_floor: 100000, days_floor: 30 } }),
            audience: SITE,
            claims: { ...drop(base, 'iss'), jti: 'tv-jti-2', oc_bond: { v: 1, sats_floor: 100000, days_floor: 30 } },
        },
        {
            name: 'signed by a retired key before it retired',
            token: await jwt({ ...base, jti: 'tv-jti-3', iat: RETIRED_AT - 60 }, { key: old.privateKey, kid: 'tv-session-0' }),
            audience: SITE,
            claims: { ...drop(base, 'iss'), jti: 'tv-jti-3', iat: RETIRED_AT - 60 },
        },
    ],
    invalid: [
        { name: 'bound to another site', token: good, audience: 'https://other.example', reason: 'audience' },
        { name: 'a family session with no aud', token: await jwt(drop(base, 'aud')), audience: SITE, reason: 'audience' },
        { name: 'expired', token: await jwt({ ...base, exp: NOW - 1 }), audience: SITE, reason: 'expired' },
        { name: 'not yet valid', token: await jwt({ ...base, nbf: NOW + 600 }), audience: SITE, reason: 'not_yet_valid' },
        { name: 'another issuer', token: await jwt({ ...base, iss: 'https://evil.example' }), audience: SITE, reason: 'issuer' },
        { name: 'no did_oc', token: await jwt(drop(base, 'did_oc')), audience: SITE, reason: 'claims' },
        { name: 'no jti', token: await jwt(drop(base, 'jti')), audience: SITE, reason: 'claims' },
        { name: 'payload changed after signing', token: `${h}.${tamperedPayload}.${good.split('.')[2]}`, audience: SITE, reason: 'signature' },
        { name: 'signed by a key not in the set', token: await jwt(base, { key: stranger.privateKey }), audience: SITE, reason: 'signature' },
        { name: 'kid not in the set', token: await jwt(base, { kid: 'tv-unknown' }), audience: SITE, reason: 'unknown_key' },
        {
            name: 'signed by a retired key after it retired',
            token: await jwt({ ...base, iat: RETIRED_AT }, { key: old.privateKey, kid: 'tv-session-0' }),
            audience: SITE,
            reason: 'retired_key',
        },
        {
            name: 'signed by a retired key, with no iat',
            token: await jwt(drop(base, 'iat'), { key: old.privateKey, kid: 'tv-session-0' }),
            audience: SITE,
            reason: 'retired_key',
        },
        { name: 'alg none', token: unsigned, audience: SITE, reason: 'algorithm' },
        { name: 'not a JWT', token: 'not-a-jwt', audience: SITE, reason: 'malformed' },
    ],
};

/** The exact body oc.event.fire sends: these keys, in this order. */
function eventBody(fields) {
    const b = { project_key: fields.project_key, subtype: fields.subtype };
    if (fields.payment_amount_sats !== undefined) b.payment_amount_sats = fields.payment_amount_sats;
    if (fields.action_label !== undefined) b.action_label = fields.action_label;
    if (fields.is_agent !== undefined) b.is_agent = fields.is_agent;
    if (fields.user_address !== undefined) b.user_address = fields.user_address;
    return JSON.stringify(b);
}
const SECRET = '9f2c7a1d4e8b03f6a5c2d1e0b9a8f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5';
const eventVectors = [
    { name: 'signed for an earner', fields: { project_key: 'pk_test_tv', subtype: 'account_created', user_address: DID } },
    {
        name: 'amount and a non-ASCII label',
        fields: { project_key: 'pk_test_tv', subtype: 'purchase', payment_amount_sats: 21000, action_label: 'café ☕', user_address: DID },
    },
].map((v, i) => {
    const timestamp = NOW + i;
    const body = eventBody(v.fields);
    const mac = createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
    return { name: v.name, secret: SECRET, timestamp, fields: v.fields, body, header: `t=${timestamp},v1=${mac}` };
});

const hookBody = JSON.stringify({
    id: 'oc-me-tv-1',
    subtype: 'account_created',
    class: 'A',
    project_key: 'pk_test_tv',
    kind: 'oc-billable-event',
    sub: 'ps_tv_0001',
});
const hookSig = sign(null, Buffer.from(hookBody, 'utf8'), hook.privateKey).toString('hex');
const headers = (sig, kid = 'tv-webhook-1') => ({
    'OC-Signature': sig,
    'OC-Key-Id': kid,
    'OC-Envelope-Id': 'oc-me-tv-1',
    'OC-Class': 'A',
});
const webhookVectors = {
    jwks: { keys: [hook.jwk] },
    valid: [{ name: 'a delivery as sent', headers: headers(hookSig), body: hookBody }],
    invalid: [
        { name: 'body changed', headers: headers(hookSig), body: hookBody.replace('A', 'B'), reason: 'signature' },
        { name: 'kid not in the set', headers: headers(hookSig, 'tv-unknown'), body: hookBody, reason: 'unknown_key' },
        { name: 'signature not hex', headers: headers('zz' + hookSig.slice(2)), body: hookBody, reason: 'malformed' },
        { name: 'no signature header', headers: { 'OC-Key-Id': 'tv-webhook-1' }, body: hookBody, reason: 'missing' },
    ],
};

// The ended sessions an integrator reads (auth-core integratorRevocationCheck,
// sdk-py RevocationList): a token carries rh, its handle for its own audience,
// HMAC(key, "ocrev-rh:" + account feed key + "|" + aud) under a key only ochk.io
// and me.ochk.io hold; me.ochk.io serves the ended handles for one audience.
const revKey = (sub) =>
    createHash('sha256').update(`ocrev1:sub:${sub}`).digest().subarray(0, 16).toString('base64url');
const RH_KEY = 'rh-vector-key-0123456789abcdef0123456789';
const rh = (accountKey, aud) =>
    createHmac('sha256', RH_KEY).update(`ocrev-rh:${accountKey}|${aud}`).digest().subarray(0, 16).toString('base64url');
const REV_SUB = 'acct-tv-0001';
const AK = revKey(REV_SUB);
const REV_SITE = 'https://site.example';
const REV_WWW = 'https://www.site.example';
const listPath = (aud) =>
    `/api/integrator/revocations?project_key=${encodeURIComponent('pk_test_tv')}&aud=${encodeURIComponent(aud)}`;
const list = (aud) => ({ v: 1, at: NOW, tokens: [], accounts: {}, handles: { [rh(AK, aud)]: NOW - 100 } });
const revocationVectors = {
    request: {
        project_key: 'pk_test_tv',
        secret: SECRET,
        timestamp: NOW,
        aud: REV_SITE,
        url: `https://me.ochk.io${listPath(REV_SITE)}`,
        signed: `GET ${listPath(REV_SITE)}`,
        header: `t=${NOW},v1=${createHmac('sha256', SECRET).update(`${NOW}.GET ${listPath(REV_SITE)}`).digest('hex')}`,
    },
    keys: [{ sub: REV_SUB, key: AK }],
    handles: [
        { key: RH_KEY, account_key: AK, aud: REV_SITE, rh: rh(AK, REV_SITE) },
        { key: RH_KEY, account_key: AK, aud: REV_WWW, rh: rh(AK, REV_WWW) },
    ],
    lists: { [REV_SITE]: list(REV_SITE), [REV_WWW]: list(REV_WWW) },
    sessions: [
        { name: 'issued before the cutoff', aud: REV_SITE, rh: rh(AK, REV_SITE), iat: NOW - 3600, status: 'revoked' },
        { name: 'issued in the cutoff second', aud: REV_SITE, rh: rh(AK, REV_SITE), iat: NOW - 100, status: 'live' },
        { name: 'no iat', aud: REV_SITE, rh: rh(AK, REV_SITE), iat: null, status: 'revoked' },
        { name: 'the www origin of the same site', aud: REV_WWW, rh: rh(AK, REV_WWW), iat: NOW - 3600, status: 'revoked' },
        { name: 'another account', aud: REV_SITE, rh: rh(revKey('acct-tv-0002'), REV_SITE), iat: NOW - 3600, status: 'live' },
        { name: 'a handle for another audience', aud: REV_SITE, rh: rh(AK, REV_WWW), iat: NOW - 3600, status: 'live' },
        { name: 'no handle: signature only', aud: REV_SITE, rh: null, iat: NOW - 3600, status: 'live' },
    ],
    // What me.ochk.io accepts as aud: exactly the origin ochk.io mints. An SDK sends the token's aud as it is.
    audiences: [
        { aud: 'https://site.example', canonical: true },
        { aud: 'https://www.site.example', canonical: true },
        { aud: 'https://Site.example', canonical: false },
        { aud: 'https://site.example:443', canonical: false },
        { aud: 'https://site.example/', canonical: false },
    ],
};

const doc = {
    description:
        'Integrator wire formats: sign-in tokens, X-OC-Signature event signatures, webhook signatures and revocation handles. ' +
        'Read by me-client (src/__tests__/integrator-vectors.test.ts) and sdk-py (tests/test_integrator_vectors.py). ' +
        'Regenerate with node scripts/gen-integrator-vectors.mjs.',
    now: NOW,
    session: sessionVectors,
    event: eventVectors,
    webhook: webhookVectors,
    revocation: revocationVectors,
};
writeFileSync(OUT, JSON.stringify(doc, null, 4) + '\n');
console.log(`wrote ${OUT}`);
