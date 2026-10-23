import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  _resetJwksCachesForTests,
  checkOcToken,
  JWT_ALG,
  readOcSessionToken,
  verifyOcToken,
} from "../index";

/**
 * `checkOcToken` tells a bad token from a key set that can't be read. Both
 * were `null` from `verifyOcToken`, so a key-set outage read as "signed out";
 * now a verifier can answer it as an outage (503) and let the client retry.
 */

const ISSUER = "https://issuer.test";
const KID = "test-key-1";

let privateKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

beforeEach(async () => {
  _resetJwksCachesForTests();
  const pair = await generateKeyPair(JWT_ALG, { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mint(claims: Record<string, unknown> = {}, key: CryptoKey = privateKey) {
  return new SignJWT({ did_oc: "did:oc:abc", ...claims })
    .setProtectedHeader({ alg: JWT_ALG, kid: KID })
    .setSubject("acct-1")
    .setJti("jti-1")
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

/** The key set answers 200 until `down()`, then 503 (or throws, with `{ refuse: true }`). */
function keySet() {
  let up = true;
  let refuse = false;
  vi.stubGlobal("fetch", async () => {
    if (!up) {
      if (refuse) throw new TypeError("fetch failed");
      return new Response("{}", { status: 503 });
    }
    return new Response(JSON.stringify(jwks), { status: 200 });
  });
  return {
    down: (opts: { refuse?: boolean } = {}) => {
      up = false;
      refuse = opts.refuse ?? false;
    },
  };
}

describe("checkOcToken · a bad token is not an outage", () => {
  it("answers valid with the session", async () => {
    keySet();
    const checked = await checkOcToken(await mint(), { issuer: ISSUER });
    expect(checked.status).toBe("valid");
    expect(checked.status === "valid" && checked.session.did_oc).toBe("did:oc:abc");
  });

  it("answers invalid for a token that fails, with the key set read", async () => {
    keySet();
    const other = (await generateKeyPair(JWT_ALG, { extractable: true })).privateKey as CryptoKey;
    expect(await checkOcToken(await mint({}, other), { issuer: ISSUER })).toEqual({ status: "invalid" });
    expect(await checkOcToken(await mint({ aud: "https://a.example" }), { issuer: ISSUER, audience: "https://b.example" })).toEqual({
      status: "invalid",
    });
    expect(await checkOcToken("not a jwt", { issuer: ISSUER })).toEqual({ status: "invalid" });
  });

  it("answers unavailable when the key set can't be read and none is held", async () => {
    keySet().down();
    expect(await checkOcToken(await mint(), { issuer: ISSUER })).toEqual({ status: "unavailable" });
    _resetJwksCachesForTests();
    keySet().down({ refuse: true });
    expect(await checkOcToken(await mint(), { issuer: ISSUER })).toEqual({ status: "unavailable" });
  });

  it("lets a held key set stand in through an outage, until it is too old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
    const ks = keySet();
    expect((await checkOcToken(await mint(), { issuer: ISSUER })).status).toBe("valid");
    ks.down();
    vi.setSystemTime(1_800_000_000_000 + 2 * 3600_000); // past the hour, within six
    expect((await checkOcToken(await mint(), { issuer: ISSUER })).status).toBe("valid");
    vi.setSystemTime(1_800_000_000_000 + 7 * 3600_000); // past six hours
    expect(await checkOcToken(await mint(), { issuer: ISSUER })).toEqual({ status: "unavailable" });
  });

  it("answers unavailable for an unknown kid while the key set can't be fetched", async () => {
    // A key may have rotated in during the outage: "can't tell", not a bad token.
    const ks = keySet();
    expect((await checkOcToken(await mint(), { issuer: ISSUER })).status).toBe("valid");
    ks.down();
    const other = await generateKeyPair(JWT_ALG, { extractable: true });
    const rotated = await new SignJWT({ did_oc: "did:oc:abc" })
      .setProtectedHeader({ alg: JWT_ALG, kid: "rotated-in" })
      .setSubject("acct-1")
      .setJti("jti-2")
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(other.privateKey as CryptoKey);
    expect(await checkOcToken(rotated, { issuer: ISSUER })).toEqual({ status: "unavailable" });
    // Within the refetch throttle too, while the last fetch failed.
    expect(await checkOcToken(rotated, { issuer: ISSUER })).toEqual({ status: "unavailable" });
    // A known kid still verifies from the copy held.
    expect((await checkOcToken(await mint(), { issuer: ISSUER })).status).toBe("valid");
  });

  it("answers invalid for an unknown kid once the key set reads again", async () => {
    keySet();
    const rotated = await new SignJWT({ did_oc: "did:oc:abc" })
      .setProtectedHeader({ alg: JWT_ALG, kid: "never-published" })
      .setSubject("acct-1")
      .setJti("jti-3")
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    expect(await checkOcToken(rotated, { issuer: ISSUER })).toEqual({ status: "invalid" });
  });

  it("takes an issuer with a trailing slash as the same issuer", async () => {
    keySet();
    expect((await checkOcToken(await mint(), { issuer: `${ISSUER}/` })).status).toBe("valid");
    expect((await verifyOcToken(await mint(), { issuer: `${ISSUER}/` }))?.did_oc).toBe("did:oc:abc");
  });

  it("answers invalid, not unavailable, for an issuer it may not fetch from", async () => {
    keySet();
    expect(await checkOcToken(await mint(), { issuer: "http://issuer.test" })).toEqual({ status: "invalid" });
  });

  it("leaves verifyOcToken as it was: a session, or null for both", async () => {
    const ks = keySet();
    expect((await verifyOcToken(await mint(), { issuer: ISSUER }))?.did_oc).toBe("did:oc:abc");
    _resetJwksCachesForTests();
    ks.down();
    expect(await verifyOcToken(await mint(), { issuer: ISSUER })).toBeNull();
  });

  it("refuses an option it does not read", async () => {
    keySet();
    await expect(checkOcToken(await mint(), { issuer: ISSUER, audiences: "x" } as never)).rejects.toThrow(
      /unknown option/,
    );
  });
});

describe("readOcSessionToken · where getOcSession finds the token", () => {
  it("reads the oc_session cookie first, then a Bearer header", () => {
    expect(readOcSessionToken({ cookie: "a=1; oc_session=tok-c", authorization: "Bearer tok-b" })).toBe("tok-c");
    expect(readOcSessionToken({ cookie: "a=1", authorization: "Bearer tok-b" })).toBe("tok-b");
    expect(readOcSessionToken(new Headers({ authorization: "bearer tok-h" }))).toBe("tok-h");
    expect(readOcSessionToken({ cookie: null, authorization: null })).toBeNull();
    expect(readOcSessionToken({ authorization: "Basic abc" })).toBeNull();
  });
});
