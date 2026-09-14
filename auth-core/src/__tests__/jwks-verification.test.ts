import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  _resetJwksCachesForTests,
  getOcSession,
  JWT_ALG,
  verifyOcToken,
} from "../index";

/**
 * The JWKS-backed verification path — `verifyOcToken` / `getOcSession`.
 *
 * This is the integrator-facing primitive: it is what me-client re-exports and
 * what a third party installs to decide who a request is. The existing suite
 * covers signing, the cookie helpers and tab pinning; none of it reached this
 * path, which is also the only one that fetches a key over the network.
 *
 * Everything here fails by returning `null` and never throwing, so a weakened
 * check looks exactly like a rejected token until somebody gets in.
 */

const ISSUER = "https://issuer.test";
const KID = "test-key-1";

let privateKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

beforeEach(async () => {
  _resetJwksCachesForTests();
  const pair = await generateKeyPair(JWT_ALG, { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  const pub = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...pub, kid: KID }] };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mint(kid: string = KID, claims: Record<string, unknown> = {}) {
  return new SignJWT({ did_oc: "did:oc:abc", ...claims })
    .setProtectedHeader({ alg: JWT_ALG, kid })
    .setSubject("acct-1")
    .setJti("jti-1")
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

/** Stub the JWKS endpoint and count fetches, so refetch behaviour is observable. */
function stubJwks(): { calls: () => number } {
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls += 1;
    return { ok: true, json: async () => jwks } as unknown as Response;
  });
  return { calls: () => calls };
}

describe("verifyOcToken", () => {
  it("verifies a token against the published key", async () => {
    stubJwks();
    expect(
      (await verifyOcToken(await mint(), { issuer: ISSUER }))?.did_oc,
    ).toBe("did:oc:abc");
  });

  it("rejects a token with no kid rather than trying every published key", async () => {
    stubJwks();
    const noKid = await new SignJWT({ did_oc: "did:oc:abc" })
      .setProtectedHeader({ alg: JWT_ALG })
      .setSubject("s")
      .setJti("j")
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    expect(await verifyOcToken(noKid, { issuer: ISSUER })).toBeNull();
  });

  it("refuses a plaintext issuer — a MITM-able JWKS defeats the whole stack", async () => {
    stubJwks();
    expect(
      await verifyOcToken(await mint(), { issuer: "http://evil.test" }),
    ).toBeNull();
  });

  it("rejects a token whose issuer is not the one whose keys were fetched", async () => {
    stubJwks();
    const wrongIssuer = await new SignJWT({ did_oc: "did:oc:abc" })
      .setProtectedHeader({ alg: JWT_ALG, kid: KID })
      .setSubject("s")
      .setJti("j")
      .setIssuer("https://elsewhere.test")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    expect(await verifyOcToken(wrongIssuer, { issuer: ISSUER })).toBeNull();
  });

  it("returns null, never throws, when the JWKS endpoint is down", async () => {
    vi.stubGlobal(
      "fetch",
      async () => ({ ok: false, status: 503 }) as unknown as Response,
    );
    await expect(
      verifyOcToken(await mint(), { issuer: ISSUER }),
    ).resolves.toBeNull();
  });

  it("picks up a rotated-in key on the first unrecognised kid", async () => {
    const j = stubJwks();
    expect(
      await verifyOcToken(await mint("rotated-in"), { issuer: ISSUER }),
    ).toBeNull();
    // Warm-up fetch plus the forced refresh the miss is FOR.
    expect(j.calls()).toBeGreaterThanOrEqual(2);
  });

  it("bounds how often an unrecognised kid can force a refetch", async () => {
    // Each miss used to drop the cache and fetch again, so a stream of
    // random kids turned an integrator's server into a refetch amplifier
    // aimed at the auth host — a round-trip in front of every rejection.
    // `inflight` only collapses CONCURRENT fetches; these are sequential.
    const j = stubJwks();
    for (let i = 0; i < 6; i++) {
      expect(
        await verifyOcToken(await mint(`unknown-${i}`), { issuer: ISSUER }),
      ).toBeNull();
    }
    expect(j.calls()).toBeLessThanOrEqual(2);
  });
});

describe("getOcSession", () => {
  it("accepts a Bearer token when there is no cookie — the cross-domain path", async () => {
    stubJwks();
    const s = await getOcSession(
      { authorization: `Bearer ${await mint()}` },
      { issuer: ISSUER },
    );
    expect(s?.sub).toBe("acct-1");
  });

  it("accepts a Web Headers object as well as a plain bag", async () => {
    stubJwks();
    const h = new Headers({ authorization: `Bearer ${await mint()}` });
    expect((await getOcSession(h, { issuer: ISSUER }))?.sub).toBe("acct-1");
  });

  it("returns null for an unauthenticated request", async () => {
    stubJwks();
    expect(await getOcSession({}, { issuer: ISSUER })).toBeNull();
  });
});
