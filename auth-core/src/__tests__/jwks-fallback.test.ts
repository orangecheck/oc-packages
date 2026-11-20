import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  _resetJwksCachesForTests,
  JWT_ALG,
  resolveSessionFromRequest,
  verifySessionToken,
  type VerifyConfig,
} from "../index";

/**
 * A site that verifies with its env key follows a rotation: a token naming
 * another kid is checked against the issuer's JWKS, and a token naming the env
 * key's own kid is checked against that key alone.
 */

const ISSUER = "https://issuer.test";
const SITE = "https://site.example";

type Pair = { privateKey: CryptoKey; jwk: Record<string, unknown> };
let oldKey: Pair;
let newKey: Pair;
let published: Record<string, unknown>[];
let fetches: number;

async function pair(kid: string): Promise<Pair> {
  const p = await generateKeyPair(JWT_ALG, { extractable: true });
  return { privateKey: p.privateKey as CryptoKey, jwk: { ...(await exportJWK(p.publicKey)), kid, alg: JWT_ALG } };
}

const env = (jwk: Record<string, unknown>) => Buffer.from(JSON.stringify(jwk)).toString("base64url");

function mint(signer: Pair, kid: string, claims: Record<string, unknown> = {}) {
  return new SignJWT({ did_oc: "did:oc:abc", ...claims })
    .setProtectedHeader({ alg: JWT_ALG, kid })
    .setSubject("acct-1")
    .setJti("jti-1")
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signer.privateKey);
}

let cfg: VerifyConfig;

beforeEach(async () => {
  _resetJwksCachesForTests();
  oldKey = await pair("old-key");
  newKey = await pair("new-key");
  published = [oldKey.jwk, newKey.jwk];
  fetches = 0;
  vi.stubGlobal("fetch", async () => {
    fetches += 1;
    return { ok: true, json: async () => ({ keys: published }) } as unknown as Response;
  });
  cfg = { publicJwk: env(oldKey.jwk), issuer: ISSUER, jwksFallback: true };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifySessionToken · jwksFallback", () => {
  it("verifies a token from the rotated-in key through the JWKS", async () => {
    const p = await verifySessionToken(await mint(newKey, "new-key"), cfg);
    expect(p?.did_oc).toBe("did:oc:abc");
    expect(fetches).toBe(1);
  });

  it("refuses that token without the option, and fetches nothing", async () => {
    const { jwksFallback: _off, ...staticOnly } = cfg;
    expect(await verifySessionToken(await mint(newKey, "new-key"), staticOnly)).toBeNull();
    expect(fetches).toBe(0);
  });

  it("checks a token naming the env key's kid against the env key alone", async () => {
    expect((await verifySessionToken(await mint(oldKey, "old-key"), cfg))?.did_oc).toBe("did:oc:abc");
    // Signed by the published new key but naming the env key's kid: the JWKS would know the
    // signer, so only the static path refuses it.
    expect(await verifySessionToken(await mint(newKey, "old-key"), cfg)).toBeNull();
    expect(fetches).toBe(0);
  });

  it("refuses a kid the JWKS does not publish", async () => {
    published = [oldKey.jwk];
    expect(await verifySessionToken(await mint(newKey, "new-key"), cfg)).toBeNull();
  });

  it("refuses a token signed by another key under the published kid", async () => {
    const stranger = await pair("new-key");
    expect(await verifySessionToken(await mint(stranger, "new-key"), cfg)).toBeNull();
  });

  it("keeps the audience on the fallback", async () => {
    const token = await mint(newKey, "new-key", { aud: "https://other.example" });
    expect(await verifySessionToken(token, { ...cfg, audience: SITE })).toBeNull();
    const ours = await mint(newKey, "new-key", { aud: SITE });
    expect((await verifySessionToken(ours, { ...cfg, audience: SITE }))?.aud).toBe(SITE);
  });

  it("refuses a misspelt option", async () => {
    const token = await mint(oldKey, "old-key");
    await expect(
      verifySessionToken(token, { publicJwk: cfg.publicJwk, jwksFallbak: true } as unknown as VerifyConfig),
    ).rejects.toThrow(/unknown option jwksFallbak/);
  });
});

describe("resolveSessionFromRequest · jwksFallback", () => {
  it("reads a rotated-in token from the cookie and from the tab header", async () => {
    const token = await mint(newKey, "new-key");
    const cookie = await resolveSessionFromRequest({ cookie: `oc_session=${token}` }, cfg);
    expect(cookie).toMatchObject({ ok: true, via: "cookie" });
    const tab = await resolveSessionFromRequest({ "x-oc-tab-session": token }, cfg);
    expect(tab).toMatchObject({ ok: true, via: "tab" });
  });

  it("finds the rotated-in cookie after an old one that no longer verifies", async () => {
    const stale = await mint(newKey, "old-key");
    const fresh = await mint(newKey, "new-key");
    const r = await resolveSessionFromRequest({ cookie: `oc_session=${stale}; oc_session=${fresh}` }, cfg);
    expect(r).toMatchObject({ ok: true, via: "cookie" });
  });
});
