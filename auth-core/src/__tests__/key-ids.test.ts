import { existsSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

import * as source from "../index";

/**
 * A token's `kid` must name one of the key set's own keys. A kid that names no
 * key in the set is refused before any signature is checked, whatever the kid
 * spells, and a key set may use any string as a kid.
 *
 * Each case runs against the source and against the build in dist/, which is
 * what a site that installs the package runs.
 */

const ISSUER = "https://issuer.test";
const NAMES = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];
const dist = new URL("../../dist/index.mjs", import.meta.url);

type AuthCore = typeof source;

const builds: Array<[string, () => Promise<AuthCore>]> = [
  ["source", async () => source],
  [
    "build",
    async () => {
      expect(existsSync(dist), "dist/index.mjs is missing: run yarn build first").toBe(true);
      return (await import(dist.href)) as AuthCore;
    },
  ],
];

let jwks: { keys: Record<string, unknown>[] };

function serveJwks(): void {
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => jwks }) as unknown as Response);
}

async function pair(): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const p = await generateKeyPair("EdDSA", { extractable: true });
  return { privateKey: p.privateKey as CryptoKey, jwk: await exportJWK(p.publicKey) };
}

async function token(
  privateKey: CryptoKey,
  header: Record<string, unknown>,
  iat = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ did_oc: "did:oc:" + "a".repeat(32) })
    .setProtectedHeader({ alg: "EdDSA", ...header })
    .setSubject("acct-1")
    .setJti("jti-1")
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(privateKey);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(builds)("key ids (%s)", (_name, load) => {
  let ac: AuthCore;
  let inSet: Awaited<ReturnType<typeof pair>>;
  let outside: Awaited<ReturnType<typeof pair>>;

  beforeEach(async () => {
    ac = await load();
    ac._resetJwksCachesForTests();
    inSet = await pair();
    outside = await pair();
    jwks = { keys: [{ ...inSet.jwk, kid: "real-kid" }] };
    serveJwks();
  });

  it("a token from the set's own key verifies", async () => {
    const t = await token(inSet.privateKey, { kid: "real-kid" });
    expect((await ac.verifyOcToken(t, { issuer: ISSUER }))?.sub).toBe("acct-1");
  });

  it.each(NAMES)("a kid that names no key in the set (%s) is invalid", async (kid) => {
    const t = await token(outside.privateKey, { kid, ...outside.jwk });
    expect(await ac.verifyOcToken(t, { issuer: ISSUER })).toBeNull();
    expect(await ac.checkOcToken(t, { issuer: ISSUER })).toEqual({ status: "invalid" });
  });

  it.each(NAMES)("a set may name its own key %s, and that key verifies", async (kid) => {
    jwks = { keys: [{ ...inSet.jwk, kid }] };
    const t = await token(inSet.privateKey, { kid });
    expect((await ac.verifyOcToken(t, { issuer: ISSUER }))?.sub).toBe("acct-1");
  });

  it("a key with such a kid that joins the set after it was cached verifies", async () => {
    expect(await ac.verifyOcToken(await token(inSet.privateKey, { kid: "real-kid" }), { issuer: ISSUER })).not.toBeNull();
    jwks = { keys: [{ ...inSet.jwk, kid: "real-kid" }, { ...inSet.jwk, kid: "toString" }] };
    const t = await token(inSet.privateKey, { kid: "toString" });
    expect((await ac.verifyOcToken(t, { issuer: ISSUER }))?.sub).toBe("acct-1");
  });

  it("a retired key with such a kid verifies only what it signed before retiring", async () => {
    const now = Math.floor(Date.now() / 1000);
    jwks = { keys: [{ ...inSet.jwk, kid: "valueOf", status: "retired", retired_at: now + 60 }] };
    expect(await ac.verifyOcToken(await token(inSet.privateKey, { kid: "valueOf" }, now), { issuer: ISSUER })).not.toBeNull();
    ac._resetJwksCachesForTests();
    jwks = { keys: [{ ...inSet.jwk, kid: "valueOf", status: "retired", retired_at: now - 60 }] };
    expect(await ac.verifyOcToken(await token(inSet.privateKey, { kid: "valueOf" }, now), { issuer: ISSUER })).toBeNull();
  });

  it("a kid that is not a string is invalid", async () => {
    for (const kid of [7, ["real-kid"], { a: 1 }]) {
      const t = await token(inSet.privateKey, { kid });
      expect(await ac.verifyOcToken(t, { issuer: ISSUER })).toBeNull();
    }
  });
});
