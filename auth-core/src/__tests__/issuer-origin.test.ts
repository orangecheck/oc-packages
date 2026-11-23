import { readFileSync } from "node:fs";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  _resetJwksCachesForTests,
  checkOcToken,
  createRevocationCheck,
  integratorRevocationCheck,
  JWT_ALG,
  parseIssuerOrigin,
  verifyOcToken,
  verifySessionToken,
} from "../index";

// The one rule for an origin a site names: an auth host's issuer, or me.ochk.io.
// sdk-py's tests/test_issuer_origin.py reads the same file.
const V = JSON.parse(readFileSync(new URL("../../test-vectors/issuer-origin.json", import.meta.url), "utf8")) as {
  accepted: { input: string; origin: string }[];
  refused: string[];
  refused_values: unknown[];
};
// An environment variable cannot hold NUL: Node cuts the value there. One with space at
// an end is trimmed first (PADDED), so only a value that is refused once trimmed is here.
const REFUSED_ENV = V.refused.filter((input) => !input.includes(String.fromCharCode(0)) && input === input.trim());
// A pasted value often ends in a line break or carries a tab: each accepted origin with one at either end.
const PADDED = V.accepted.flatMap(({ input, origin }) =>
  ["\n", "\r\n", "\t", " "].flatMap((pad) => [
    { input: input + pad, origin },
    { input: pad + input, origin },
  ]),
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetJwksCachesForTests();
});

/** Records every URL fetched and answers each with a 503. */
function recorder() {
  const urls: string[] = [];
  const fetch = (async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return new Response("{}", { status: 503 });
  }) as typeof globalThis.fetch;
  return { urls, fetch };
}

const SESSION = {
  sub: "acct-1",
  did_oc: "did:oc:0123456789abcdef0123456789abcdef",
  jti: "jti-1",
  iat: Math.floor(Date.now() / 1000),
  aud: "https://site.example",
  rh: "rh-site",
};
const KEYED = { projectKey: "pk_test_origin", signingSecret: "f".repeat(64) };
const LIST = "/api/integrator/revocations?project_key=pk_test_origin&aud=https%3A%2F%2Fsite.example";

describe("parseIssuerOrigin", () => {
  it.each(V.accepted)("takes $input as $origin", ({ input, origin }) => {
    expect(parseIssuerOrigin(input)).toBe(origin);
  });

  it.each(V.refused)("refuses %j", (input) => {
    expect(parseIssuerOrigin(input)).toBeNull();
  });

  it.each(V.refused_values)("refuses the value %j", (value) => {
    expect(parseIssuerOrigin(value)).toBeNull();
  });
});

describe("checkOcToken takes its issuer by that rule", () => {
  it.each(V.accepted)("fetches the keys at $origin for $input", async ({ input, origin }) => {
    const r = recorder();
    vi.stubGlobal("fetch", r.fetch);
    expect(await checkOcToken("a.b.c", { issuer: input })).toEqual({ status: "unavailable" });
    expect(r.urls).toEqual([`${origin}/.well-known/jwks.json`]);
  });

  it.each(V.refused)("throws for %j and fetches nothing", async (input) => {
    const r = recorder();
    vi.stubGlobal("fetch", r.fetch);
    await expect(checkOcToken("a.b.c", { issuer: input })).rejects.toThrow(/issuer must be one origin/);
    expect(await verifyOcToken("a.b.c", { issuer: input })).toBeNull();
    expect(r.urls).toEqual([]);
  });
});

describe("a token's iss names its issuer by that rule", () => {
  let signer: CryptoKey;
  let jwk: Record<string, unknown>;
  beforeAll(async () => {
    const pair = await generateKeyPair(JWT_ALG, { extractable: true });
    signer = pair.privateKey as CryptoKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: "k-origin", alg: JWT_ALG };
  });
  const mint = (iss: string) =>
    new SignJWT({ ...SESSION })
      .setProtectedHeader({ alg: JWT_ALG, kid: "k-origin" })
      .setIssuer(iss)
      .setExpirationTime("5m")
      .sign(signer);
  /** Serves the key set at every URL and records each one asked for. */
  function serve() {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    });
    return urls;
  }

  it.each(V.accepted)("checkOcToken with issuer $input takes iss $origin", async ({ input, origin }) => {
    const urls = serve();
    expect(await checkOcToken(await mint(origin), { issuer: input, audience: SESSION.aud })).toMatchObject({
      status: "valid",
    });
    expect(urls).toEqual([`${origin}/.well-known/jwks.json`]);
  });

  it.each(V.accepted)("checkOcToken with issuer $input takes iss $input", async ({ input }) => {
    serve();
    expect(await checkOcToken(await mint(input), { issuer: input, audience: SESSION.aud })).toMatchObject({
      status: "valid",
    });
  });

  it.each(V.accepted)("verifySessionToken with issuer $input takes iss $origin", async ({ input, origin }) => {
    const publicJwk = Buffer.from(JSON.stringify(jwk)).toString("base64url");
    expect(await verifySessionToken(await mint(origin), { publicJwk, issuer: input, audience: SESSION.aud })).toMatchObject({
      sub: SESSION.sub,
    });
  });

  it("refuses an iss that names another origin", async () => {
    serve();
    const check = await checkOcToken(await mint("https://other.example"), { issuer: "https://OCHK.io", audience: SESSION.aud });
    expect(check.status).toBe("invalid");
  });
});

describe("integratorRevocationCheck takes meOrigin and OC_ME_ORIGIN by that rule", () => {
  it.each(V.accepted)("reads the list at $origin for meOrigin $input", async ({ input, origin }) => {
    const r = recorder();
    await integratorRevocationCheck({ ...KEYED, meOrigin: input, fetch: r.fetch })!.status(SESSION);
    expect(r.urls).toEqual([`${origin}${LIST}`]);
  });

  it.each(V.accepted)("reads the list at $origin for OC_ME_ORIGIN $input", async ({ input, origin }) => {
    vi.stubEnv("OC_ME_ORIGIN", input);
    const r = recorder();
    await integratorRevocationCheck({ ...KEYED, fetch: r.fetch })!.status(SESSION);
    expect(r.urls).toEqual([`${origin}${LIST}`]);
  });

  it.each(V.refused)("throws for meOrigin %j when it is made", (input) => {
    expect(() => integratorRevocationCheck({ ...KEYED, meOrigin: input })).toThrow(/meOrigin must be one origin/);
  });

  it.each(REFUSED_ENV)("throws for OC_ME_ORIGIN %j when it is made", (input) => {
    vi.stubEnv("OC_ME_ORIGIN", input);
    expect(() => integratorRevocationCheck(KEYED)).toThrow(/OC_ME_ORIGIN must be one origin/);
  });

  it.each(PADDED)("trims OC_ME_ORIGIN %j and reads the list at its origin", async ({ input, origin }) => {
    vi.stubEnv("OC_ME_ORIGIN", input);
    const r = recorder();
    await integratorRevocationCheck({ ...KEYED, fetch: r.fetch })!.status(SESSION);
    expect(r.urls).toEqual([`${origin}${LIST}`]);
  });
});

describe("the ochk.io feed takes OC_AUTH_ISSUER by that rule", () => {
  it.each(V.accepted)("reads the feed at $origin for $input", async ({ input, origin }) => {
    vi.stubEnv("OC_AUTH_ISSUER", input);
    const r = recorder();
    await createRevocationCheck({ token: "feed-token", fetch: r.fetch }).status(SESSION);
    expect(r.urls).toEqual([`${origin}/api/auth/revocations`]);
  });

  it.each(REFUSED_ENV)("throws for %j when it is made", (input) => {
    vi.stubEnv("OC_AUTH_ISSUER", input);
    expect(() => createRevocationCheck({ token: "feed-token" })).toThrow(/OC_AUTH_ISSUER must be one origin/);
  });

  it.each(PADDED)("trims %j and reads the feed at its origin", async ({ input, origin }) => {
    vi.stubEnv("OC_AUTH_ISSUER", input);
    const r = recorder();
    await createRevocationCheck({ token: "feed-token", fetch: r.fetch }).status(SESSION);
    expect(r.urls).toEqual([`${origin}/api/auth/revocations`]);
  });

  it("does not read it when the feed's URL is given", () => {
    vi.stubEnv("OC_AUTH_ISSUER", "http://ochk.io/feed");
    expect(() => createRevocationCheck({ token: "feed-token", url: "https://feed.example/list" })).not.toThrow();
  });
});
