// ─── Relay assertions ───────────────────────────────────────────────────
//
// A relay (the owner cockpit) acts on another site for an owner who proved
// themselves to it moments ago. A bearer token and an asserted did say who is
// calling, not whether that owner just stepped up for this action. The relay
// signs a short assertion for each write instead: Ed25519, one request, at most
// 60 s, naming the actor, the time of their step-up, the method, the path and
// a hash of the body. The site holds only the public half and spends each
// assertion's jti once.
//
// The body hash is SHA-256 over the body's RFC 8785 canonical JSON, the
// canonicalizer OC Stamp and OC Agent share. The relay hashes JSON.parse of the
// exact string it sends, and the site hashes the body as it parsed it, so both
// hash the same value however each serialises. No body (undefined, null or the
// empty string, which is what a Next.js route reads for a request sent with no
// body and no content type) hashes the empty string; an empty object hashes "{}".
// Server-only: it uses node:crypto.

import { createHash } from "node:crypto";

import { canonicalize, type JsonValue } from "@orangecheck/stamp-core/canonical";
import { compactVerify, decodeProtectedHeader, importJWK, SignJWT, type CryptoKey, type KeyObject } from "jose";

import { refuseUnknownOptions } from "./options";

/** The request header that carries an assertion. */
export const RELAY_ASSERTION_HEADER = "x-oc-relay-assertion" as const;
/** The JWS `typ` every assertion carries; any other is refused. */
export const RELAY_ASSERTION_TYP = "oc-relay+jwt" as const;
/** The longest an assertion may live. */
export const RELAY_ASSERTION_MAX_TTL_S = 60;
/** How far ahead of the site's clock an assertion's `iat` may be. */
export const RELAY_ASSERTION_MAX_SKEW_S = 5;

const ALG = "EdDSA";
const EMBEDDED_KEY_PARAMS = ["jwk", "jku", "x5u", "x5c", "x5t", "x5t#S256", "crit"] as const;
const SIGN_OPTIONS = new Set(["privateJwk", "kid", "audience", "actor", "sudoAt", "request", "ttlSeconds", "now", "jti"]);
const SIGN_REQUEST = new Set(["method", "path", "wireBody"]);
const VERIFY_OPTIONS = new Set(["token", "publicJwks", "audience", "actor", "request", "maxSudoAgeSeconds", "claimJti", "now"]);
const VERIFY_REQUEST = new Set(["method", "path", "body"]);

/** The request a relay signs for. `path` is the origin-form request target as sent, query included. */
export interface RelaySignRequest {
  method: string;
  path: string;
  /** The exact JSON string sent as the body, or undefined when there is none. */
  wireBody?: string;
}

/** The request as the site received it. `path` is the request target, query included (Next.js `req.url`). */
export interface RelayVerifyRequest {
  method: string;
  path: string;
  /** The body as the site parsed it (Next.js `req.body`). */
  body?: unknown;
}

/** What a verified assertion says. Times are Unix seconds. */
export interface RelayAssertionClaims {
  v: 1;
  aud: string;
  actor: string;
  sudo_at: number;
  method: string;
  path: string;
  body_sha256: string;
  iat: number;
  exp: number;
  jti: string;
}

// Origin-form: a "/" not followed by another (a parser reads "//x" as a host), visible ASCII, no "#".
const ORIGIN_FORM = /^\/(?!\/)[!"$-~]*$/;

function originForm(target: string): string | null {
  if (!ORIGIN_FORM.test(target)) return null;
  const q = target.indexOf("?");
  if (q < 0) return target;
  const query = new URLSearchParams(target.slice(q + 1)).toString();
  return query ? `${target.slice(0, q)}?${query}` : target.slice(0, q);
}

/** The path as sent, its query in URLSearchParams form (Next.js `req.url`). Throws unless origin-form. */
export function relayRequestTarget(target: string): string {
  const form = originForm(target);
  if (form === null) {
    throw new TypeError("@orangecheck/auth-core: a request target is one '/' then visible ASCII, with no '#'");
  }
  return form;
}

/** Hex SHA-256 of a body's canonical JSON; the empty string's hash when there is no body. */
export function relayBodySha256(body: unknown): string {
  const text = body === undefined || body === null || body === "" ? "" : canonicalize(body as JsonValue);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface SignRelayAssertionInput {
  /** Base64url JWK holding the relay's Ed25519 private key. */
  privateJwk: string;
  /** The key's id, which the site looks up in its JWKS. */
  kid: string;
  /** The site's origin, e.g. `https://me.ochk.io`. */
  audience: string;
  /** The owner the relay acts for. */
  actor: string;
  /** When that owner last stepped up, in Unix seconds; not later than now. */
  sudoAt: number;
  request: RelaySignRequest;
  /** Seconds to live, 1 to 60. Defaults to 60. */
  ttlSeconds?: number;
  /** Unix seconds; for tests. */
  now?: number;
  /** For tests; a random UUID otherwise. */
  jti?: string;
}

/** Sign one assertion for one request. Throws on an input it would not sign. */
export async function signRelayAssertion(input: SignRelayAssertionInput): Promise<string> {
  refuseUnknownOptions("signRelayAssertion", input, SIGN_OPTIONS);
  refuseUnknownOptions("signRelayAssertion request", input.request, SIGN_REQUEST);
  const ttl = input.ttlSeconds ?? RELAY_ASSERTION_MAX_TTL_S;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > RELAY_ASSERTION_MAX_TTL_S) {
    throw new RangeError(`@orangecheck/auth-core: a relay assertion lives 1 to ${RELAY_ASSERTION_MAX_TTL_S} s`);
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(input.sudoAt) || input.sudoAt <= 0 || input.sudoAt > now) {
    throw new RangeError("@orangecheck/auth-core: sudoAt is Unix seconds, not later than now");
  }
  if (!input.kid || !input.audience || !input.actor) {
    throw new TypeError("@orangecheck/auth-core: kid, audience and actor are required");
  }
  const wire = input.request.wireBody;
  const body = wire === undefined || wire === "" ? undefined : (JSON.parse(wire) as unknown);
  const key = await importJWK(decodeB64urlJson(input.privateJwk, "private JWK"), ALG);
  return new SignJWT({
    v: 1,
    actor: input.actor,
    sudo_at: input.sudoAt,
    method: input.request.method.toUpperCase(),
    path: relayRequestTarget(input.request.path),
    body_sha256: relayBodySha256(body),
  })
    .setProtectedHeader({ alg: ALG, typ: RELAY_ASSERTION_TYP, kid: input.kid })
    .setAudience(input.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setJti(input.jti ?? crypto.randomUUID())
    .sign(key);
}

export type RelayAssertionRefusal =
  | "malformed"
  | "unknown_kid"
  | "bad_signature"
  | "wrong_audience"
  | "expired"
  | "not_yet_valid"
  | "too_long"
  | "sudo_stale"
  | "actor_mismatch"
  | "request_mismatch"
  | "body_mismatch"
  | "replayed"
  | "store_unavailable";

export type RelayAssertionResult =
  | { ok: true; claims: RelayAssertionClaims }
  | { ok: false; reason: RelayAssertionRefusal };

export interface VerifyRelayAssertionInput {
  token: string;
  /** The relay's public keys: base64url of a JWKS, each key an Ed25519 OKP with a `kid`. */
  publicJwks: string;
  /** This site's origin; the assertion's `aud` must equal it. */
  audience: string;
  /** The did the request asserts (X-OC-Actor-Did); the assertion's `actor` must equal it. */
  actor: string;
  request: RelayVerifyRequest;
  /** The site's step-up window: an assertion whose `sudo_at` is older than this is refused as `sudo_stale`. */
  maxSudoAgeSeconds: number;
  /**
   * Spend the jti: resolve true the first time it is seen, false after. Keep it
   * until `exp`. Throw when the store cannot answer: the assertion is then
   * refused as `store_unavailable`, and the caller answers 503.
   */
  claimJti: (jti: string, exp: number) => Promise<boolean>;
  /** Unix seconds; for tests. */
  now?: number;
}

/**
 * Check one assertion against the request it came with. Every other check
 * runs before the jti is spent, so a refused assertion spends nothing. Throws
 * only on a configuration error: an unreadable `publicJwks`, an unknown option
 * or a missing `maxSudoAgeSeconds`.
 */
export async function verifyRelayAssertion(input: VerifyRelayAssertionInput): Promise<RelayAssertionResult> {
  refuseUnknownOptions("verifyRelayAssertion", input, VERIFY_OPTIONS);
  refuseUnknownOptions("verifyRelayAssertion request", input.request, VERIFY_REQUEST);
  if (!Number.isInteger(input.maxSudoAgeSeconds) || input.maxSudoAgeSeconds < 1) {
    throw new RangeError("@orangecheck/auth-core: maxSudoAgeSeconds is required, a whole number of seconds");
  }
  const keys = await loadRelayKeys(input.publicJwks);
  let kid: unknown;
  try {
    const header = decodeProtectedHeader(input.token);
    if (header.alg !== ALG || header.typ !== RELAY_ASSERTION_TYP) return refuse("malformed");
    // The key comes from this site's own JWKS by kid, never from the token.
    if (EMBEDDED_KEY_PARAMS.some((k) => k in header)) return refuse("malformed");
    kid = header.kid;
  } catch {
    return refuse("malformed");
  }
  const key = typeof kid === "string" ? keys.get(kid) : undefined;
  if (!key) return refuse("unknown_kid");

  let payload: Uint8Array;
  try {
    ({ payload } = await compactVerify(input.token, key, { algorithms: [ALG] }));
  } catch {
    return refuse("bad_signature");
  }
  const claims = parseClaims(payload);
  if (!claims) return refuse("malformed");

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (claims.aud !== input.audience) return refuse("wrong_audience");
  if (claims.exp <= now) return refuse("expired");
  if (claims.iat > now + RELAY_ASSERTION_MAX_SKEW_S) return refuse("not_yet_valid");
  if (claims.exp - claims.iat > RELAY_ASSERTION_MAX_TTL_S || claims.exp <= claims.iat) return refuse("too_long");
  if (now - claims.sudo_at > input.maxSudoAgeSeconds) return refuse("sudo_stale");
  if (claims.actor !== input.actor) return refuse("actor_mismatch");
  if (claims.method !== input.request.method.toUpperCase() || claims.path !== originForm(input.request.path)) {
    return refuse("request_mismatch");
  }
  let bodyHash: string;
  try {
    bodyHash = relayBodySha256(input.request.body);
  } catch {
    return refuse("body_mismatch");
  }
  if (claims.body_sha256 !== bodyHash) return refuse("body_mismatch");

  let fresh: boolean;
  try {
    fresh = await input.claimJti(claims.jti, claims.exp);
  } catch {
    return refuse("store_unavailable");
  }
  if (!fresh) return refuse("replayed");
  return { ok: true, claims };
}

function refuse(reason: RelayAssertionRefusal): RelayAssertionResult {
  return { ok: false, reason };
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function parseClaims(payload: Uint8Array): RelayAssertionClaims | null {
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!c || typeof c !== "object" || c.v !== 1) return null;
  if (!text(c.aud) || !text(c.actor) || !text(c.method) || !text(c.path) || !text(c.jti)) return null;
  if (!int(c.sudo_at) || !int(c.iat) || !int(c.exp) || c.sudo_at > c.iat) return null;
  if (typeof c.body_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(c.body_sha256)) return null;
  return {
    v: 1,
    aud: c.aud,
    actor: c.actor,
    sudo_at: c.sudo_at,
    method: c.method,
    path: c.path,
    body_sha256: c.body_sha256,
    iat: c.iat,
    exp: c.exp,
    jti: c.jti,
  };
}

type RelayKey = CryptoKey | KeyObject;
let keysFor: string | null = null;
let keysPromise: Promise<Map<string, RelayKey>> | null = null;

function loadRelayKeys(publicJwks: string): Promise<Map<string, RelayKey>> {
  if (!keysPromise || keysFor !== publicJwks) {
    keysFor = publicJwks;
    keysPromise = importRelayKeys(publicJwks);
  }
  return keysPromise;
}

async function importRelayKeys(publicJwks: string): Promise<Map<string, RelayKey>> {
  const set = decodeB64urlJson(publicJwks, "public JWKS") as { keys?: unknown };
  if (!Array.isArray(set.keys) || set.keys.length === 0) {
    throw new Error("@orangecheck/auth-core: the relay JWKS holds no keys");
  }
  const out = new Map<string, RelayKey>();
  for (const jwk of set.keys as Array<Record<string, unknown>>) {
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !text(jwk.kid) || !text(jwk.x)) {
      throw new Error("@orangecheck/auth-core: each relay key is an Ed25519 OKP with a kid");
    }
    if ("d" in jwk) throw new Error("@orangecheck/auth-core: the relay JWKS holds a private key");
    if (out.has(jwk.kid)) throw new Error(`@orangecheck/auth-core: relay kid ${jwk.kid} appears twice`);
    out.set(jwk.kid, (await importJWK({ kty: "OKP", crv: "Ed25519", x: jwk.x }, ALG)) as RelayKey);
  }
  return out;
}

function decodeB64urlJson(value: string, what: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error(`@orangecheck/auth-core: the relay ${what} is not base64url JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`@orangecheck/auth-core: the relay ${what} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}
