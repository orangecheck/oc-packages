import { createHash, generateKeyPairSync, sign as edSign, type KeyObject } from "node:crypto";

import { decodeProtectedHeader, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  RELAY_ASSERTION_HEADER,
  RELAY_ASSERTION_MAX_TTL_S,
  RELAY_ASSERTION_TYP,
  relayBodySha256,
  relayRequestTarget,
  signRelayAssertion,
  verifyRelayAssertion,
  type RelaySignRequest,
  type SignRelayAssertionInput,
  type VerifyRelayAssertionInput,
} from "../relay-assertion";

// A relay assertion binds one write to one owner, one request and one minute.
// Every refusal must spend nothing, and every check must be the one that refuses.

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

interface Pair {
  kid: string;
  priv: KeyObject;
  privateJwk: string;
  publicJwk: Record<string, unknown>;
}

function pair(kid: string): Pair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    kid,
    priv: privateKey,
    privateJwk: b64(privateKey.export({ format: "jwk" })),
    publicJwk: { ...publicKey.export({ format: "jwk" }), kid },
  };
}

const K1 = pair("cockpit-1");
const K2 = pair("cockpit-2");
const jwks = (...keys: Array<Record<string, unknown>>) => b64({ keys });

const NOW = 1_800_000_000;
const AUD = "https://me.ochk.io";
const ACTOR = `did:oc:${"a".repeat(32)}`;
const SUDO = NOW - 30;
const PATH = "/api/admin/user/disable?reason=abuse";
const BODY = { amount: 5, note: "x", tags: ["a", "b"] };
// The same value as BODY, sent with other key order and spacing.
const WIRE = '{ "tags": ["a", "b"],  "note": "x", "amount": 5 }';

const sign = (over: Partial<SignRelayAssertionInput> = {}, request: Partial<RelaySignRequest> = {}) =>
  signRelayAssertion({
    privateJwk: K1.privateJwk,
    kid: K1.kid,
    audience: AUD,
    actor: ACTOR,
    sudoAt: SUDO,
    now: NOW,
    jti: "jti-1",
    ...over,
    request: { method: "POST", path: PATH, wireBody: WIRE, ...request },
  });

async function check(token: string, over: Partial<VerifyRelayAssertionInput> = {}) {
  const spent: Array<[string, number]> = [];
  const result = await verifyRelayAssertion({
    token,
    publicJwks: jwks(K1.publicJwk),
    audience: AUD,
    actor: ACTOR,
    request: { method: "POST", path: PATH, body: BODY },
    maxSudoAgeSeconds: 300,
    claimJti: async (jti, exp) => {
      spent.push([jti, exp]);
      return true;
    },
    now: NOW,
    ...over,
  });
  return { result, spent };
}

// A token built by hand, so a test can set any header or claim and still sign it with a configured key.
const CLAIMS = {
  v: 1,
  aud: AUD,
  actor: ACTOR,
  sudo_at: SUDO,
  method: "POST",
  path: PATH,
  body_sha256: relayBodySha256(BODY),
  iat: NOW,
  exp: NOW + 60,
  jti: "jti-raw",
};
const HEADER = { alg: "EdDSA", typ: RELAY_ASSERTION_TYP, kid: K1.kid };

function raw(header: Record<string, unknown>, payload: unknown, key: KeyObject | null = K1.priv): string {
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${key ? edSign(null, Buffer.from(input), key).toString("base64url") : ""}`;
}

const refused = (reason: string) => ({ ok: false, reason });

describe("relayBodySha256", () => {
  it("hashes the empty string for no body: undefined, null and ''", () => {
    const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect([undefined, null, ""].map(relayBodySha256)).toEqual([empty, empty, empty]);
  });

  it('hashes "{}" for an empty object, which is not the same as no body', () => {
    expect(relayBodySha256({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    expect(relayBodySha256({})).not.toBe(relayBodySha256(undefined));
  });

  it("hashes RFC 8785 canonical JSON: sorted keys, no spaces, escaped strings", () => {
    const e = String.fromCharCode(0xe9);
    const body = { b: 2, a: { d: [true, null, 1.5], c: `${e}\n` } };
    const canonical = `{"a":{"c":"${e}\\n","d":[true,null,1.5]},"b":2}`;
    expect(relayBodySha256(body)).toBe(sha256(canonical));
    expect(relayBodySha256(body)).toBe("d2c201b6a01ff75376c4145882a35a1ce2e9e619344b7a8c10e4735606b6ba00");
  });

  it("is the same for the same value in any key order", () => {
    expect(relayBodySha256({ b: 1, a: [1, "x"] })).toBe(relayBodySha256({ a: [1, "x"], b: 1 }));
    expect(relayBodySha256({ a: 1 })).not.toBe(relayBodySha256({ a: 2 }));
  });
});

describe("relayRequestTarget", () => {
  it.each([
    ["/a/b", "/a/b"],
    ["/a?", "/a"],
    ["/p%C3%A9x/f?note=a%2Fb%20c&k=1&k=2", "/p%C3%A9x/f?note=a%2Fb+c&k=1&k=2"],
    ["/a?x=a+b", "/a?x=a+b"],
    ["/a?x=%2B", "/a?x=%2B"],
    ["/a?x=~", "/a?x=%7E"],
    ["/a?k", "/a?k="],
    ["/a?x=%ZZ", "/a?x=%25ZZ"],
  ])("keeps the path and writes the query as URLSearchParams does: %s", (sent, bound) => {
    expect(relayRequestTarget(sent)).toBe(bound);
    expect(relayRequestTarget(bound)).toBe(bound);
  });

  it.each(["", "*", "api/x", "//evil.example/x", "http://h/a", "/a#b", "/a b", "/\u00e9", "/a\n"])(
    "takes only an origin-form target: %j",
    (target) => {
      expect(() => relayRequestTarget(target)).toThrow(TypeError);
    },
  );
});

describe("sign, then verify", () => {
  it("verifies its own assertion and returns every claim", async () => {
    const { result, spent } = await check(await sign());
    expect(result).toEqual({
      ok: true,
      claims: {
        v: 1,
        aud: AUD,
        actor: ACTOR,
        sudo_at: SUDO,
        method: "POST",
        path: PATH,
        body_sha256: relayBodySha256(BODY),
        iat: NOW,
        exp: NOW + RELAY_ASSERTION_MAX_TTL_S,
        jti: "jti-1",
      },
    });
    expect(spent).toEqual([["jti-1", NOW + 60]]);
  });

  it("builds a valid token by hand too, so each hand-built refusal below is its one changed field", async () => {
    const { result } = await check(raw(HEADER, CLAIMS));
    expect(result.ok).toBe(true);
  });

  it("names the header and typ the sites read", () => {
    expect(RELAY_ASSERTION_HEADER).toBe("x-oc-relay-assertion");
    expect(RELAY_ASSERTION_TYP).toBe("oc-relay+jwt");
  });

  it("hashes JSON.parse of the wire string, so spacing, key order and escapes do not matter", async () => {
    expect((await check(await sign())).result.ok).toBe(true);
    const escaped = '{"n":"\\u00e9"}';
    const token = await sign({}, { wireBody: escaped });
    const parsed = { n: String.fromCharCode(0xe9) };
    expect((await check(token, { request: { method: "POST", path: PATH, body: parsed } })).result.ok).toBe(true);
  });

  it("matches every form of no body on either side", async () => {
    for (const wireBody of [undefined, ""]) {
      const token = await sign({}, { wireBody });
      for (const body of [undefined, null, ""]) {
        const { result } = await check(token, { request: { method: "POST", path: PATH, body } });
        expect(result.ok, `wire ${String(wireBody)} body ${String(body)}`).toBe(true);
      }
    }
  });

  it("keeps an empty object apart from no body", async () => {
    const withObject = await sign({}, { wireBody: "{}" });
    const noBody = await sign({ jti: "jti-2" }, { wireBody: undefined });
    const req = (body: unknown) => ({ request: { method: "POST", path: PATH, body } });
    expect((await check(withObject, req({}))).result.ok).toBe(true);
    expect((await check(withObject, req(""))).result).toEqual(refused("body_mismatch"));
    expect((await check(noBody, req({}))).result).toEqual(refused("body_mismatch"));
  });

  it("binds the query in the form Next.js hands the route, whichever form was sent", async () => {
    const sent = "/api/x?note=a%2Fb%20c&k=1&k=2";
    const token = await sign({}, { path: sent });
    expect(decodePayload(token).path).toBe("/api/x?note=a%2Fb+c&k=1&k=2");
    for (const path of [sent, "/api/x?note=a%2Fb+c&k=1&k=2"]) {
      expect((await check(token, { request: { method: "POST", path, body: BODY } })).result.ok, path).toBe(true);
    }
  });

  it("compares methods in upper case on both sides", async () => {
    const token = await sign({}, { method: "post" });
    expect(decodePayload(token).method).toBe("POST");
    expect((await check(token, { request: { method: "post", path: PATH, body: BODY } })).result.ok).toBe(true);
  });

  it("signs a protected header of exactly alg, typ and kid", async () => {
    expect(decodeProtectedHeader(await sign())).toEqual({ alg: "EdDSA", typ: RELAY_ASSERTION_TYP, kid: K1.kid });
  });

  it("lives 60 s by default and as long as asked within 1 to 60", async () => {
    const life = (t: string) => decodePayload(t).exp - decodePayload(t).iat;
    expect(life(await sign())).toBe(60);
    expect(life(await sign({ ttlSeconds: 1 }))).toBe(1);
    expect(life(await sign({ ttlSeconds: 60 }))).toBe(60);
  });

  it("gives each assertion a random jti when none is passed", async () => {
    const a = decodePayload(await sign({ jti: undefined })).jti;
    const b = decodePayload(await sign({ jti: undefined })).jti;
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

function decodePayload(token: string): { method: string; path: string; iat: number; exp: number; jti: string } {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe("the signer refuses", () => {
  it.each([0, 61, 1.5, -1, Number.NaN])("a ttl of %s", async (ttlSeconds) => {
    await expect(sign({ ttlSeconds })).rejects.toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN, NOW + 1])("a sudoAt of %s, later than now or not Unix seconds", async (sudoAt) => {
    await expect(sign({ sudoAt })).rejects.toThrow(RangeError);
  });

  it("nothing for a step-up this very second", async () => {
    await expect(sign({ sudoAt: NOW })).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it.each(["kid", "audience", "actor"] as const)("an empty %s", async (field) => {
    await expect(sign({ [field]: "" })).rejects.toThrow(TypeError);
  });

  it("a private JWK that is not base64url JSON", async () => {
    await expect(sign({ privateJwk: "%%%" })).rejects.toThrow(/not base64url JSON/);
  });

  it("a wire body that is not JSON", async () => {
    await expect(sign({}, { wireBody: "a=1&b=2" })).rejects.toThrow(SyntaxError);
  });

  it.each(["", "//evil.example/x", "http://h/a", "/a#b", "/a b"])("a target that is not origin-form: %j", async (path) => {
    await expect(sign({}, { path })).rejects.toThrow(TypeError);
  });
});

// Each case: the token, what to verify it against, and the one reason it is refused.
const REFUSALS: Array<[string, () => Promise<string>, Partial<VerifyRelayAssertionInput>, string]> = [
  ["an empty token", async () => "", {}, "malformed"],
  ["a token of two parts", async () => "a.b", {}, "malformed"],
  ["a token that is not base64url", async () => "%%%.%%%.%%%", {}, "malformed"],
  ["no typ", async () => raw({ alg: "EdDSA", kid: K1.kid }, CLAIMS), {}, "malformed"],
  ["another typ", async () => raw({ ...HEADER, typ: "JWT" }, CLAIMS), {}, "malformed"],
  ["alg none", async () => raw({ ...HEADER, alg: "none" }, CLAIMS, null), {}, "malformed"],
  [
    "alg HS256",
    () =>
      new SignJWT(CLAIMS)
        .setProtectedHeader({ alg: "HS256", typ: RELAY_ASSERTION_TYP, kid: K1.kid })
        .sign(new TextEncoder().encode("k".repeat(32))),
    {},
    "malformed",
  ],
  ...(["jwk", "jku", "x5u", "x5c", "x5t", "x5t#S256", "crit"] as const).map(
    (param): [string, () => Promise<string>, Partial<VerifyRelayAssertionInput>, string] => [
      `an embedded ${param}`,
      async () => raw({ ...HEADER, [param]: param === "jwk" ? K2.publicJwk : ["x"] }, CLAIMS),
      {},
      "malformed",
    ],
  ),
  ["no kid", async () => raw({ alg: "EdDSA", typ: RELAY_ASSERTION_TYP }, CLAIMS), {}, "unknown_kid"],
  ["a kid the site does not hold", () => sign({ kid: K2.kid, privateJwk: K2.privateJwk }), {}, "unknown_kid"],
  ["another key under the configured kid", () => sign({ privateJwk: K2.privateJwk }), {}, "bad_signature"],
  [
    "a payload changed after signing",
    async () => {
      const [h, , s] = (await sign()).split(".");
      return `${h}.${b64({ ...CLAIMS, path: "/api/admin/user/disable?reason=other" })}.${s}`;
    },
    {},
    "bad_signature",
  ],
  [
    "a header changed after signing",
    async () => {
      const [, p, s] = (await sign()).split(".");
      return `${b64({ ...HEADER, kid: K2.kid })}.${p}.${s}`;
    },
    { publicJwks: jwks(K1.publicJwk, K2.publicJwk) },
    "bad_signature",
  ],
  ["v 2", async () => raw(HEADER, { ...CLAIMS, v: 2 }), {}, "malformed"],
  ["no v", async () => raw(HEADER, { ...CLAIMS, v: undefined }), {}, "malformed"],
  ["no sudo_at", async () => raw(HEADER, { ...CLAIMS, sudo_at: undefined }), {}, "malformed"],
  ["a sudo_at of 0", async () => raw(HEADER, { ...CLAIMS, sudo_at: 0 }), {}, "malformed"],
  ["a sudo_at string", async () => raw(HEADER, { ...CLAIMS, sudo_at: String(SUDO) }), {}, "malformed"],
  ["a fractional iat", async () => raw(HEADER, { ...CLAIMS, iat: NOW + 0.5 }), {}, "malformed"],
  ["an upper-case hash", async () => raw(HEADER, { ...CLAIMS, body_sha256: CLAIMS.body_sha256.toUpperCase() }), {}, "malformed"],
  ["a short hash", async () => raw(HEADER, { ...CLAIMS, body_sha256: CLAIMS.body_sha256.slice(1) }), {}, "malformed"],
  ["an empty jti", async () => raw(HEADER, { ...CLAIMS, jti: "" }), {}, "malformed"],
  ["an aud array", async () => raw(HEADER, { ...CLAIMS, aud: [AUD] }), {}, "malformed"],
  ["a null payload", async () => raw(HEADER, null), {}, "malformed"],
  ["a payload that is not JSON", async () => raw(HEADER, "not json"), {}, "malformed"],
  ["another audience", () => sign({ audience: "https://vault.ochk.io" }), {}, "wrong_audience"],
  ["the second it expires", () => sign(), { now: NOW + 60 }, "expired"],
  ["after it expires", () => sign(), { now: NOW + 600 }, "expired"],
  ["an iat more than 5 s ahead", () => sign({ now: NOW + 6 }), {}, "not_yet_valid"],
  ["a life of 61 s", async () => raw(HEADER, { ...CLAIMS, exp: NOW + 61 }), {}, "too_long"],
  ["an exp at its iat", async () => raw(HEADER, { ...CLAIMS, iat: NOW + 3, exp: NOW + 3 }), {}, "too_long"],
  ["a step-up older than the window", () => sign({ sudoAt: NOW - 301 }), {}, "sudo_stale"],
  ["a step-up older than a shorter window", () => sign({ sudoAt: NOW - 61 }), { maxSudoAgeSeconds: 60 }, "sudo_stale"],
  [
    "a step-up inside the window when signed and outside it when verified",
    () => sign({ now: NOW - 40, sudoAt: NOW - 320 }),
    {},
    "sudo_stale",
  ],
  ["a sudo_at after its iat", async () => raw(HEADER, { ...CLAIMS, sudo_at: NOW + 1 }), {}, "malformed"],
  ["another actor", () => sign({ actor: `did:oc:${"b".repeat(32)}` }), {}, "actor_mismatch"],
  ["another method", () => sign({}, { method: "PUT" }), {}, "request_mismatch"],
  ["another query", () => sign({}, { path: "/api/admin/user/disable?reason=other" }), {}, "request_mismatch"],
  ["no query", () => sign({}, { path: "/api/admin/user/disable" }), {}, "request_mismatch"],
  ["another path", () => sign({}, { path: "/api/admin/user/enable?reason=abuse" }), {}, "request_mismatch"],
  [
    "a repeated key in another order",
    () => sign({}, { path: `${PATH}&k=1&k=2` }),
    { request: { method: "POST", path: `${PATH}&k=2&k=1`, body: BODY } },
    "request_mismatch",
  ],
  [
    "a plus sent as %2B, against a space",
    () => sign({}, { path: `${PATH}&x=a%2Bb` }),
    { request: { method: "POST", path: `${PATH}&x=a+b`, body: BODY } },
    "request_mismatch",
  ],
  ...["//evil.example/x", "http://h/a", "/a#b", "/a b"].map(
    (path): [string, () => Promise<string>, Partial<VerifyRelayAssertionInput>, string] => [
      `a target that is not origin-form, ${JSON.stringify(path)}, signed and sent alike`,
      async () => raw(HEADER, { ...CLAIMS, path }),
      { request: { method: "POST", path, body: BODY } },
      "request_mismatch",
    ],
  ),
  ["another body", () => sign({}, { wireBody: '{"amount":6,"note":"x","tags":["a","b"]}' }), {}, "body_mismatch"],
  [
    "a body the site cannot hash",
    () => sign(),
    { request: { method: "POST", path: PATH, body: { amount: Number.POSITIVE_INFINITY } } },
    "body_mismatch",
  ],
];

describe("the verifier refuses, and spends no jti on a refusal", () => {
  it.each(REFUSALS)("%s", async (_name, token, over, reason) => {
    const { result, spent } = await check(await token(), over);
    expect(result).toEqual(refused(reason));
    expect(spent).toEqual([]);
  });
});

describe("the verifier's time window", () => {
  it("takes an assertion a second before it expires", async () => {
    expect((await check(await sign(), { now: NOW + 59 })).result.ok).toBe(true);
  });

  it("takes an iat up to 5 s ahead", async () => {
    expect((await check(await sign({ now: NOW + 5 }))).result.ok).toBe(true);
  });

  it("takes a step-up exactly the window old", async () => {
    expect((await check(await sign({ sudoAt: NOW - 300 }))).result.ok).toBe(true);
    expect((await check(await sign({ sudoAt: NOW - 60, jti: "jti-2" }), { maxSudoAgeSeconds: 60 })).result.ok).toBe(true);
  });

  it.each([undefined, 0, -1, 1.5, Number.NaN])("throws on a maxSudoAgeSeconds of %s", async (maxSudoAgeSeconds) => {
    await expect(check(await sign(), { maxSudoAgeSeconds })).rejects.toThrow(/maxSudoAgeSeconds is required/);
  });
});

describe("the jti store", () => {
  it("refuses an assertion the second time it is seen", async () => {
    const seen = new Set<string>();
    const claimJti = async (jti: string) => !seen.has(jti) && Boolean(seen.add(jti));
    const token = await sign();
    expect((await check(token, { claimJti })).result.ok).toBe(true);
    expect((await check(token, { claimJti })).result).toEqual(refused("replayed"));
    expect((await check(await sign({ jti: "jti-2" }), { claimJti })).result.ok).toBe(true);
  });

  it("refuses as store_unavailable when the store cannot answer", async () => {
    const claimJti = async () => {
      throw new Error("kv down");
    };
    expect((await check(await sign(), { claimJti })).result).toEqual(refused("store_unavailable"));
  });
});

describe("the relay JWKS", () => {
  const bad: Array<[string, string, RegExp]> = [
    ["not base64url JSON", "%%%", /not base64url JSON/],
    ["a JSON array", b64([K1.publicJwk]), /not a JSON object/],
    ["no keys", b64({}), /holds no keys/],
    ["an empty key list", b64({ keys: [] }), /holds no keys/],
    ["a private key", jwks({ ...JSON.parse(Buffer.from(K1.privateJwk, "base64url").toString()), kid: K1.kid }), /private key/],
    ["a key with no kid", jwks({ ...K1.publicJwk, kid: undefined }), /Ed25519 OKP with a kid/],
    ["an X25519 key", jwks({ ...generateKeyPairSync("x25519").publicKey.export({ format: "jwk" }), kid: "x" }), /Ed25519 OKP/],
    ["a P-256 key", jwks({ ...generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" }), kid: "p" }), /Ed25519 OKP/],
    ["one kid twice", jwks(K1.publicJwk, { ...K2.publicJwk, kid: K1.kid }), /appears twice/],
  ];

  it.each(bad)("throws on %s, as a configuration error", async (_name, publicJwks, message) => {
    const token = await sign();
    await expect(check(token, { publicJwks })).rejects.toThrow(message);
    await expect(check(token, { publicJwks })).rejects.toThrow(message);
  });

  it("takes either key while two are configured, for a rotation", async () => {
    const both = jwks(K1.publicJwk, K2.publicJwk);
    expect((await check(await sign(), { publicJwks: both })).result.ok).toBe(true);
    const byK2 = await sign({ kid: K2.kid, privateJwk: K2.privateJwk });
    expect((await check(byK2, { publicJwks: both })).result.ok).toBe(true);
  });

  it("reads a changed JWKS, not the one it read before", async () => {
    const token = await sign();
    expect((await check(token)).result.ok).toBe(true);
    expect((await check(token, { publicJwks: jwks(K2.publicJwk) })).result).toEqual(refused("unknown_kid"));
    expect((await check(token)).result.ok).toBe(true);
  });
});

describe("an unknown option", () => {
  it("throws in the signer, in its options or its request", async () => {
    await expect(sign({ audiance: AUD } as never)).rejects.toThrow(/unknown option audiance/);
    await expect(sign({}, { body: "{}" } as never)).rejects.toThrow(/request: unknown option body/);
  });

  it("throws in the verifier, in its options or its request", async () => {
    const token = await sign();
    await expect(check(token, { audiance: AUD } as never)).rejects.toThrow(/unknown option audiance/);
    const request = { method: "POST", path: PATH, wireBody: WIRE } as never;
    await expect(check(token, { request })).rejects.toThrow(/request: unknown option wireBody/);
  });
});
