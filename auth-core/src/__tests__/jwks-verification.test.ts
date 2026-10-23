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

describe("verifyOcToken · a token that carries a revocation handle", () => {
  const SITE = "https://site.example";

  it("needs one string aud, the audience asked for", async () => {
    stubJwks();
    const ok = await verifyOcToken(await mint(KID, { aud: SITE, rh: "rh-1" }), { issuer: ISSUER, audience: SITE });
    expect(ok?.rh).toBe("rh-1");
    for (const aud of [[SITE], [SITE, "https://other.example"]]) {
      const token = await mint(KID, { aud, rh: "rh-1" });
      expect(await verifyOcToken(token, { issuer: ISSUER, audience: SITE })).toBeNull();
      expect(await verifyOcToken(token, { issuer: ISSUER, audience: "*" })).toBeNull();
    }
  });

  it("refuses a handle that is not a non-empty string", async () => {
    stubJwks();
    for (const rh of [42, "", ["rh-1"]]) {
      expect(await verifyOcToken(await mint(KID, { aud: SITE, rh }), { issuer: ISSUER, audience: SITE })).toBeNull();
    }
  });
});

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

describe("verifyOcToken · keys rotated out", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);
  async function mintAt(iat: number) {
    return new SignJWT({ did_oc: "did:oc:abc" })
      .setProtectedHeader({ alg: JWT_ALG, kid: KID })
      .setSubject("acct-1")
      .setJti("jti-1")
      .setIssuer(ISSUER)
      .setIssuedAt(iat)
      .setExpirationTime(nowSec() + 300)
      .sign(privateKey);
  }

  it("honours a retired key only for tokens it signed before it retired", async () => {
    const retiredAt = nowSec() - 600;
    jwks = { keys: [{ ...jwks.keys[0]!, status: "retired", retired_at: retiredAt }] };
    stubJwks();
    expect(await verifyOcToken(await mintAt(retiredAt - 60), { issuer: ISSUER })).not.toBeNull();
    _resetJwksCachesForTests();
    expect(await verifyOcToken(await mintAt(retiredAt), { issuer: ISSUER })).toBeNull();
    _resetJwksCachesForTests();
    expect(await verifyOcToken(await mintAt(nowSec()), { issuer: ISSUER })).toBeNull();
  });

  it("uses a stale key list through an outage only up to the cap", async () => {
    let up = true;
    vi.stubGlobal("fetch", async () =>
      up
        ? ({ ok: true, json: async () => jwks } as unknown as Response)
        : ({ ok: false, status: 503 } as unknown as Response),
    );
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0);
    const opts = { issuer: ISSUER, jwksCacheTtlMs: 1_000, jwksMaxStaleMs: 5_000 };
    const token = await mint();
    expect(await verifyOcToken(token, opts)).not.toBeNull();
    up = false;
    clock.mockReturnValue(t0 + 3_000); // past the TTL, inside the cap
    expect(await verifyOcToken(token, opts)).not.toBeNull();
    clock.mockReturnValue(t0 + 6_000); // past the cap
    expect(await verifyOcToken(token, opts)).toBeNull();
  });

  it("keeps the cached keys when an unknown kid arrives during an outage", async () => {
    let up = true;
    vi.stubGlobal("fetch", async () =>
      up
        ? ({ ok: true, json: async () => jwks } as unknown as Response)
        : ({ ok: false, status: 503 } as unknown as Response),
    );
    const token = await mint();
    expect(await verifyOcToken(token, { issuer: ISSUER })).not.toBeNull();
    up = false;
    expect(await verifyOcToken(await mint("unknown"), { issuer: ISSUER })).toBeNull();
    expect(await verifyOcToken(token, { issuer: ISSUER })).not.toBeNull();
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

describe("verifyOcToken · audience", () => {
  // The path integrators call from their own backends, via withOcAuth.
  const A = "https://site-a.example";
  const B = "https://site-b.example";

  it("accepts a token bound to the integrator's own audience", async () => {
    stubJwks();
    const t = await mint(KID, { aud: A });
    expect(await verifyOcToken(t, { issuer: ISSUER, audience: A })).not.toBeNull();
  });

  it("refuses a token another site was given", async () => {
    stubJwks();
    const t = await mint(KID, { aud: A });
    expect(await verifyOcToken(t, { issuer: ISSUER, audience: B })).toBeNull();
  });

  it("refuses a bound token where a family session is expected", async () => {
    stubJwks();
    const t = await mint(KID, { aud: A });
    expect(await verifyOcToken(t, { issuer: ISSUER })).toBeNull();
  });
});

