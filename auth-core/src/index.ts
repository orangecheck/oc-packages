/**
 * @orangecheck/auth-core
 *
 * Cross-subdomain oc_session JWT verification + cookie helpers.
 *
 * The auth HOST (whoever owns sign-in) holds a private key and issues
 * tokens with `signSession()`. Every CONSUMER subdomain holds only the
 * public JWK and verifies tokens locally with `verifySessionToken()` —
 * no network round-trip, no shared secret.
 *
 * The ochk.io ecosystem picks Ed25519 (EdDSA) with JWKs distributed
 * via environment variable. The public key is also published at
 * `/.well-known/jwks.json` on the auth host for dynamic discovery.
 */

import {
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWTPayload,
  type KeyObject,
} from "jose";

import { refuseUnknownOptions } from "./options";

export const JWT_ALG = "EdDSA" as const;
export const SESSION_COOKIE = "oc_session" as const;
export const DEFAULT_ISSUER = "https://ochk.io" as const;

export type AuthKey = CryptoKey | KeyObject;

/**
 * The kinds of identity a user can surface as their account-badge
 * label. `did` is the canonical `did:oc` identifier (always available
 * and the ultimate fallback); the other three are linked identities
 * the user may or may not have.
 */
export const DISPLAY_IDENTITY_KINDS = ["did", "btc", "email", "nostr"] as const;
export type DisplayIdentityKind = (typeof DISPLAY_IDENTITY_KINDS)[number];

/**
 * The identity a user has chosen to display in their account badge —
 * carried as a JWT claim so every `.ochk.io` subdomain (and any
 * integrator reading the session) renders the same label with no
 * network round-trip, exactly like `name` / `npub`.
 *
 * `kind` is which identity; `value` is the full, renderable value (the
 * `did:oc`, the Bitcoin address, the email, or the npub). Only the
 * *promoted* identity's value is carried — never the whole identity
 * set — so an unrelated email never enters the token.
 */
export interface DisplayIdentity {
  kind: DisplayIdentityKind;
  value: string;
}

/**
 * A bond (oc-attest-protocol BOND.md): one unspent coin the account pledged.
 * The token carries floors, never the coin, so an app learns that a coin of
 * at least `sats_floor` sats, unspent at least `days_floor` days, backs this
 * account, and nothing about which coin it is.
 */
export interface BondClaim {
  v: 1;
  /** Largest of 1000, 10000, 100000, 1000000, 10000000 the coin meets; 0 for none. */
  sats_floor: number;
  /** Largest of 7, 30, 90, 365 days the coin has been unspent; 0 for none. */
  days_floor: number;
  /** Block height at which the issuer last found the coin unspent. */
  height: number;
  /** Unix seconds of that check. */
  checked_at: number;
  /**
   * Same for the same coin at your site, unrelated anywhere else, and keyed by the
   * issuer so it doesn't reveal the coin. *.ochk.io sites share the family session,
   * so they share one. Keep one account per nullifier; block it to block the coin.
   */
  nullifier: string;
}

export interface SessionPayload extends JWTPayload {
  sub: string;
  /**
   * Who the token is for. Absent on a family session (the `oc_session` cookie
   * on `*.ochk.io`). On a token from the ochk.app sign-in popup it is one
   * string: the origin of the page that opened the popup. Verify with
   * `audience` set to your own origin.
   */
  aud?: string | string[];
  /**
   * Unix seconds when this token was minted. For a popup token that is the end
   * of the popup's sign-in, not when the person's ochk.io session began. Keep
   * it with `rh` and `aud`: a cutoff on the list of ended sessions is compared
   * with it.
   */
  iat?: number;
  /**
   * Unix seconds after which the token no longer verifies. For a popup token it
   * is the earlier of the ochk.io session's expiry and `iat` + 30 days. It is
   * never refreshed: when it passes, the person signs in again.
   */
  exp?: number;
  /**
   * Opaque public-facing identifier · `did:oc:<32-hex>`. The sole
   * canonical user identifier post auth-refactor. Stable across
   * linking events. Per AUTH-REFACTOR-PLAN.md §2.1.
   */
  did_oc: string;
  jti: string;
  /**
   * Optional display name set by the user via the auth host's profile
   * surface. When present, consumer subdomains can render it in their
   * header chip without a network round-trip. Re-minted on signin and
   * whenever the user updates their profile.
   */
  name?: string | null;
  /** Optional Nostr npub set by the user. Same lifecycle as `name`. */
  npub?: string | null;
  /**
   * @deprecated No longer minted. Where a person's sats sit is me.ochk.io's
   * to say, per federation, from its own ledger (`/api/me/balance`).
   */
  home_federation?: string | null;
  /**
   * Whether the account signs with its own Bitcoin key. The auth host
   * derives it at every mint from the account's verified linked
   * identities; no one can set it.
   *
   *   - 'bip322'             — a BIP-322-verified Bitcoin address is linked.
   *   - 'fedimint_threshold' — none is, so the account holds no key here.
   *   - 'fedimint_client'    — reserved; never minted.
   *
   * It says who holds the signing key, never who holds the sats.
   */
  signing_method?: "fedimint_threshold" | "fedimint_client" | "bip322" | null;
  /**
   * Historical did_ocs consolidated INTO this account via the
   * /api/auth/link/btc transfer-under-dual-proof flow. Consumers that
   * aggregate per-user data should union queries across
   * `[did_oc, ...merged_from]`. Absent / empty means "no absorbed
   * accounts." Order is not significant.
   *
   * Family sessions only (orangecheck's own sites). A token the sign-in
   * popup issues to another site never carries it, because it would hand
   * that site ids it never saw; it carries `merged_rh` instead.
   */
  merged_from?: string[];
  /**
   * On a token for one audience: the revocation handle, for that same
   * audience, of each account merged into this one (up to 16). A site
   * matches them only against handles it stored when those accounts signed
   * in, so it can move a user to the account they use now and learns no id
   * it hadn't already seen. Absent when nothing was merged in.
   */
  merged_rh?: string[];
  /**
   * The token's revocation handle on its audience's list of ended sessions,
   * on every token the ochk.app sign-in popup issues: one handle per account
   * and audience. A token that carries one verifies only with a single string
   * `aud`. Keep it with `aud` and `iat` to check "sign out everywhere".
   */
  rh?: string;
  /**
   * Unix seconds when the user last successfully completed a WebAuthn
   * step-up assertion on the auth host. Consumer subdomains gate
   * sensitive actions on `(now - step_up_at) < their_window` —
   * typically 5 minutes. Absent on JWTs minted before WebAuthn
   * shipped, or on tokens minted by ordinary signin (only set by
   * /api/auth/webauthn/assertion/verify on success). Use
   * `verifyStepUpClaim()` to read it safely.
   */
  step_up_at?: number;
  /**
   * Unix seconds when the user last successfully completed an inline
   * sudo-mode re-authentication on the auth host (email-OTP for
   * email-primary identities, BIP-322 challenge for btc-primary
   * identities). Gates auth-graph-mutating operations — register an
   * additional WebAuthn credential, revoke one, link a new identity,
   * change recovery method — without forcing a full sign-out/sign-in.
   * Same shape and freshness window posture as `step_up_at`; the two
   * are independent claims (sudo proves "you typed your password
   * again," step-up proves "you tapped your hardware key"). Read it
   * with `verifySudoClaim()`.
   */
  sudo_at?: number;
  /**
   * Optional best-effort owner flag · set by the auth host at signin
   * time when the new did_oc matches OWNER_OC_ADDRESSES. Surfaced
   * through to clients via `useOcSession().account.isOwner` so the
   * family-switcher and other low-stakes UX can render owner-only
   * affordances (e.g. an analytics.ochk.io entry).
   *
   * **NOT A SECURITY BOUNDARY.** Sensitive surfaces still re-check
   * the live `OWNER_OC_ADDRESSES` env against `session.did_oc` on
   * every request (analytics.ochk.io's requireOwner does this).
   * If an owner is removed from the env, their JWT may still carry
   * `is_owner: true` for up to 30 days — the UX hint goes stale,
   * but every gated action they attempt re-fails server-side.
   *
   * Treat absence as `false`. Set only on first signin or re-issue;
   * never mutated mid-session.
   */
  is_owner?: boolean;
  /**
   * The identity the user has chosen to show in their account badge
   * — the collapsed label every family site (and any integrator)
   * renders instead of the raw `did:oc`. Baked into the JWT so the
   * choice is consistent across every `.ochk.io` subdomain with no
   * round-trip, the same posture as `name` / `npub`.
   *
   * Re-resolved by the auth host on every mint: an explicit user
   * promotion wins; absent that, it defaults to the account's
   * sign-in identity (BIP-322 accounts → their Bitcoin address,
   * federation accounts → their email). Absent / null on tokens
   * minted before this field shipped — consumers fall back to the
   * `did_oc`. Read it safely with `resolveDisplayIdentity()`.
   */
  display_identity?: DisplayIdentity | null;
  /**
   * Present when the account is backed by a bond. Absent means no bond, not
   * a failed check. Read it with `readBondClaim()` / `bondMeets()`.
   */
  oc_bond?: BondClaim;
}

/** The token's bond claim when it is well-formed, else null. */
export function readBondClaim(payload: SessionPayload): BondClaim | null {
  const b = payload.oc_bond as Partial<BondClaim> | undefined;
  if (!b || typeof b !== "object" || b.v !== 1) return null;
  const nums = [b.sats_floor, b.days_floor, b.height, b.checked_at];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
  if (typeof b.nullifier !== "string" || !/^[0-9a-f]{64}$/.test(b.nullifier)) return null;
  return b as BondClaim;
}

/**
 * True when the account is backed by a coin whose floors reach `minSats`
 * and `minDays`, and the issuer checked it within
 * `maxAgeSecs` (default: no limit). Compare against the floor ladder: a
 * `minSats` of 50000 is met by a `sats_floor` of 100000, not 10000.
 */
export function bondMeets(
  payload: SessionPayload,
  need: { minSats?: number; minDays?: number; maxAgeSecs?: number },
): boolean {
  const b = readBondClaim(payload);
  if (!b) return false;
  if (b.sats_floor < (need.minSats ?? 0)) return false;
  if (b.days_floor < (need.minDays ?? 0)) return false;
  if (need.maxAgeSecs !== undefined) {
    const age = Math.floor(Date.now() / 1000) - b.checked_at;
    if (age < 0 || age > need.maxAgeSecs) return false;
  }
  return true;
}

/**
 * Returns true when the JWT carries a fresh `step_up_at` claim —
 * i.e. the user successfully completed a WebAuthn assertion within
 * the supplied freshness window (in seconds). Returns false for
 * tokens that lack the claim entirely, that carry a stale value,
 * that carry a value somehow in the future, or where the freshness
 * window is non-positive.
 *
 * Consumers gating sensitive actions read this in two places:
 *
 *   - Client side · before calling the action, to decide whether to
 *     trigger `useStepUpAuth()`. Skip the prompt if already fresh.
 *   - Server side · in the route handler, AFTER verifying the JWT,
 *     to enforce the policy regardless of what the client did.
 *
 * The freshness window is consumer-chosen — typical default is 300s
 * (5 min); higher-value spends might use 60s.
 */
export function verifyStepUpClaim(
  payload: SessionPayload,
  opts: { max_age_secs: number },
): boolean {
  if (typeof payload.step_up_at !== "number") return false;
  if (!Number.isFinite(payload.step_up_at)) return false;
  if (opts.max_age_secs <= 0) return false;
  const ageSec = Math.floor(Date.now() / 1000) - payload.step_up_at;
  return ageSec >= 0 && ageSec < opts.max_age_secs;
}

/**
 * Returns true when the JWT carries a fresh `sudo_at` claim — i.e. the
 * user successfully re-authenticated inline (email-OTP or BIP-322
 * challenge) within the supplied freshness window. Independent of
 * `step_up_at` · sudo is "you proved your primary identity again,"
 * step-up is "you tapped your hardware key."
 *
 * Returns false for tokens that lack the claim, that carry a stale
 * value, that carry a future-dated value (clock skew or malicious
 * mint), or where the freshness window is non-positive.
 *
 * Use this to gate auth-graph-mutating operations on the auth host —
 * adding a second hardware key, linking a new identity, generating
 * recovery codes, changing recovery method. Default window is 5
 * minutes; tighten per-operation as needed.
 */
export function verifySudoClaim(
  payload: SessionPayload,
  opts: { max_age_secs: number },
): boolean {
  if (typeof payload.sudo_at !== "number") return false;
  if (!Number.isFinite(payload.sudo_at)) return false;
  if (opts.max_age_secs <= 0) return false;
  const ageSec = Math.floor(Date.now() / 1000) - payload.sudo_at;
  return ageSec >= 0 && ageSec < opts.max_age_secs;
}

/**
 * Resolve the account-badge identity for a session — total, never
 * throws, always returns a renderable `{ kind, value }`.
 *
 * Returns the JWT's `display_identity` claim when it is present and
 * well-formed; otherwise falls back to the canonical `did:oc`. Use
 * this everywhere you render the badge label rather than reading the
 * raw claim, so tokens minted before the field shipped (and tokens
 * carrying a malformed claim) degrade gracefully to the did.
 *
 * This is the single resolver both `<OcAccountMenu>` and integrators
 * building their own chip should call.
 */
export function resolveDisplayIdentity(
  payload: SessionPayload,
): DisplayIdentity {
  const claim = payload.display_identity;
  if (
    claim &&
    typeof claim === "object" &&
    typeof claim.value === "string" &&
    claim.value.length > 0 &&
    (DISPLAY_IDENTITY_KINDS as readonly string[]).includes(claim.kind)
  ) {
    return { kind: claim.kind, value: claim.value };
  }
  return { kind: "did", value: payload.did_oc };
}

/**
 * Which audience a verifier accepts.
 *
 *   omitted   → a FAMILY session only: the token must carry no `aud`.
 *   a string  → a token bound to that audience (or one of several).
 *   "*"       → either. For the routes built to receive tokens that
 *               integrators forward.
 *
 * Omitted is the strict default: a token bound to a relying party is that
 * party's credential and never a family sign-in. Tokens minted before
 * audiences existed carry no `aud`, so every existing session keeps
 * verifying exactly as before.
 */
export type AudienceRule = string | readonly string[] | "*";

/**
 * A token that carries a revocation handle names one audience, as a string,
 * and its handle is a non-empty string: a list of ended sessions is kept per
 * audience, so only then can one end it. A token with no handle is unaffected.
 */
function handleBoundToOneAudience(p: { aud?: unknown; rh?: unknown }): boolean {
  if (p.rh === undefined) return true;
  return typeof p.rh === "string" && p.rh.length > 0 && typeof p.aud === "string";
}

/** Pure · does the payload's `aud` satisfy the rule? */
export function audienceSatisfied(aud: unknown, rule: AudienceRule | undefined): boolean {
  const have = aud === undefined ? [] : Array.isArray(aud) ? aud : [aud];
  if (rule === "*") return true;
  if (rule === undefined) return have.length === 0;
  const want = typeof rule === "string" ? [rule] : rule;
  return have.some((a) => typeof a === "string" && want.includes(a));
}

export interface VerifyConfig {
  /** Base64url-encoded JWK containing the Ed25519 public key. */
  publicJwk: string;
  /** Expected `iss` claim. Tokens with a different issuer are rejected. */
  issuer?: string;
  /** Accepted `aud` · see AudienceRule. Omit for family sessions. */
  audience?: AudienceRule;
}

export interface SignConfig extends VerifyConfig {
  /** Base64url-encoded JWK containing the Ed25519 private key. */
  privateJwk: string;
  /** Short key id placed in the JWT header (`kid`). Must match the JWK. */
  kid: string;
}

/** The options {@link verifySessionToken} and {@link resolveSessionFromRequest} read. */
const VERIFY_CONFIG: ReadonlySet<string> = new Set<keyof VerifyConfig>(["publicJwk", "issuer", "audience"]);
/**
 * The options {@link signSession} reads. `publicJwk` is part of the type and
 * harmless; `audience` is not read, since a token's audience is `claims.aud`.
 */
const SIGN_CONFIG: ReadonlySet<string> = new Set<keyof SignConfig>(["privateJwk", "kid", "issuer", "publicJwk"]);

// ─── JWK helpers ────────────────────────────────────────────────────────

function decodeJwk(value: string): Record<string, unknown> {
  const json =
    typeof Buffer !== "undefined"
      ? Buffer.from(value, "base64url").toString("utf8")
      : new TextDecoder().decode(base64UrlDecode(value));
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "[@orangecheck/auth-core] JWK env did not decode to an object",
    );
  }
  return parsed;
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = typeof atob !== "undefined" ? atob(b64) : "";
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let publicKeyPromise: Promise<AuthKey> | null = null;
let publicKeyCache: string | null = null;
export function loadPublicKey(publicJwk: string): Promise<AuthKey> {
  if (!publicKeyPromise || publicKeyCache !== publicJwk) {
    publicKeyCache = publicJwk;
    publicKeyPromise = importJWK(
      decodeJwk(publicJwk),
      JWT_ALG,
    ) as Promise<AuthKey>;
  }
  return publicKeyPromise;
}

let privateKeyPromise: Promise<AuthKey> | null = null;
let privateKeyCache: string | null = null;
export function loadPrivateKey(privateJwk: string): Promise<AuthKey> {
  if (!privateKeyPromise || privateKeyCache !== privateJwk) {
    privateKeyCache = privateJwk;
    privateKeyPromise = importJWK(
      decodeJwk(privateJwk),
      JWT_ALG,
    ) as Promise<AuthKey>;
  }
  return privateKeyPromise;
}

/** Parse the `OC_AUTH_PUBLIC_JWK` env var back into a JWK object. */
export function parsePublicJwk(publicJwk: string): Record<string, unknown> {
  return decodeJwk(publicJwk);
}

// ─── Sign / verify ──────────────────────────────────────────────────────

/**
 * Mint a fresh oc_session JWT. Only called on the auth host (the only
 * place that holds the private key).
 *
 * The caller owns recording an ended token's `jti` for the revocation
 * feed that {@link createRevocationCheck} reads.
 */
export async function signSession(
  claims: {
    sub: string;
    did_oc: string;
    jti: string;
    name?: string | null;
    npub?: string | null;
    home_federation?: string | null;
    signing_method?: "fedimint_threshold" | "fedimint_client" | "bip322" | null;
    merged_from?: string[];
    step_up_at?: number;
    sudo_at?: number;
    display_identity?: DisplayIdentity | null;
    /** Bind the token to one relying party (e.g. `https://example.com`).
     *  Omit for a family session. A bound token verifies only where that
     *  audience is expected — never as a family sign-in. */
    aud?: string;
  },
  cfg: SignConfig,
  ttlSeconds: number,
): Promise<string> {
  if (cfg && typeof cfg === "object" && "audience" in cfg) {
    throw new TypeError(
      "@orangecheck/auth-core: signSession does not read cfg.audience. Bind a token to a relying party with claims.aud.",
    );
  }
  refuseUnknownOptions("signSession", cfg, SIGN_CONFIG);
  const now = Math.floor(Date.now() / 1000);
  // did_oc is the sole user identifier. The legacy `addr` shim that
  // mirrored did_oc was dropped in v2.0.0 along with the type field.
  const { aud, ...rest } = claims;
  const jwt = new SignJWT(rest)
    .setProtectedHeader({ alg: JWT_ALG, typ: "JWT", kid: cfg.kid })
    .setIssuer(cfg.issuer ?? DEFAULT_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds);
  if (aud) jwt.setAudience(aud);
  return jwt.sign(await loadPrivateKey(cfg.privateJwk));
}

/**
 * Crypto-only JWT verify. Returns the payload on success, `null` on
 * any failure (bad signature, expired, wrong issuer, malformed).
 *
 * Safe for consumer subdomains — they only need the public JWK. A signed-out
 * token still verifies here; pass the payload to
 * {@link familyRevocationCheck} to refuse it.
 */
export async function verifySessionToken(
  token: string,
  cfg: VerifyConfig,
): Promise<SessionPayload | null> {
  refuseUnknownOptions("verifySessionToken", cfg, VERIFY_CONFIG);
  try {
    const res = await jwtVerify(token, await loadPublicKey(cfg.publicJwk), {
      algorithms: [JWT_ALG],
      issuer: cfg.issuer ?? DEFAULT_ISSUER,
    });
    const p = res.payload as SessionPayload;
    if (!p.sub || !p.did_oc || !p.jti) return null;
    if (!audienceSatisfied(p.aud, cfg.audience)) return null;
    if (!handleBoundToOneAudience(p)) return null;
    return p;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ─────────────────────────────────────────────────────

export interface CookieOptions {
  domain?: string;
  maxAge?: number;
  expires?: Date;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

/**
 * Serialize a cookie header value for `Set-Cookie`. Defaults match the
 * ochk.io session shape: HttpOnly, SameSite=Lax, Path=/, Secure in prod.
 */
export function serializeSessionCookie(
  token: string,
  opts: CookieOptions = {},
): string {
  const parts: string[] = [`${SESSION_COOKIE}=${token}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.httpOnly ?? true) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  if (opts.secure ?? true) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  return parts.join("; ");
}

/** Clear the session cookie. Must match the Domain used when it was set. */
export function clearSessionCookieHeader(
  opts: Pick<CookieOptions, "domain" | "path" | "secure"> = {},
): string {
  return serializeSessionCookie("", {
    ...opts,
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Read the oc_session token out of a raw `Cookie:` header string.
 * Returns `null` if the cookie is missing or empty.
 */
export function readSessionCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const prefix = `${SESSION_COOKIE}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const val = trimmed.slice(prefix.length);
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

/**
 * Read EVERY oc_session value out of a raw `Cookie:` header string.
 * Multiple same-name cookies are legitimate (e.g. a stale host-scoped
 * cookie shadowing the `Domain=.ochk.io` one) — verification should
 * try each rather than trust ordering.
 */
export function readAllSessionCookies(
  cookieHeader: string | null | undefined,
): string[] {
  if (!cookieHeader) return [];
  const prefix = `${SESSION_COOKIE}=`;
  const out: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const val = trimmed.slice(prefix.length);
      if (val.length > 0) out.push(val);
    }
  }
  return out;
}

// ─── Per-tab session resolution (multi-account · tab pinning) ───────────
//
// One browser holds ONE shared `oc_session` cookie (the browser-wide
// default account) but may be signed into N roster accounts, each with
// its own concurrently-valid session JWT. A tab "pins" itself to one
// account by holding that account's JWT in sessionStorage and sending
// it on every API call as the `x-oc-tab-session` header. The header
// value is a full session JWT — a *credential*, never a bare selector —
// so servers verify it exactly like the cookie token and stay
// stateless.

/** Header carrying a tab-pinned session JWT. Lowercase (Node folds headers). */
export const TAB_SESSION_HEADER = "x-oc-tab-session" as const;

export type ResolveSessionResult =
  | { ok: true; payload: SessionPayload; via: "tab" | "cookie" }
  | { ok: false; reason: "tab_invalid" | "no_session" };

/** Header bag shapes accepted by {@link resolveSessionFromRequest}. */
export type IncomingRequestHeaders =
  Headers | Record<string, string | string[] | undefined>;

function headerValue(
  headers: IncomingRequestHeaders,
  name: string,
): string | null {
  if (isHeaders(headers)) return headers.get(name);
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" ? raw : null;
}

/**
 * Resolve the EFFECTIVE session for a request — the per-tab choke
 * point every consumer's `readJwtSession` should delegate to.
 *
 * Precedence:
 *   1. `x-oc-tab-session` header, when present. **Fail-closed**: a
 *      present-but-invalid tab token resolves to
 *      `{ ok: false, reason: 'tab_invalid' }` rather than silently
 *      falling back to the cookie — falling back would execute the
 *      request as a DIFFERENT account than the tab is displaying,
 *      which is precisely the bug per-tab pinning exists to prevent.
 *      Clients clear their pin on 401 and re-resolve.
 *   2. Every `oc_session` cookie in the jar, first one that verifies.
 *
 * Crypto-only (signature + exp + iss via {@link verifySessionToken}); a
 * signed-out token still resolves, so pass the payload to
 * {@link familyRevocationCheck}. Throws only on an option it does not read.
 */
export async function resolveSessionFromRequest(
  headers: IncomingRequestHeaders,
  cfg: VerifyConfig,
): Promise<ResolveSessionResult> {
  refuseUnknownOptions("resolveSessionFromRequest", cfg, VERIFY_CONFIG);
  const tabToken = headerValue(headers, TAB_SESSION_HEADER);
  if (tabToken) {
    const payload = await verifySessionToken(tabToken, cfg);
    if (payload) return { ok: true, payload, via: "tab" };
    return { ok: false, reason: "tab_invalid" };
  }
  const cookieHeader = headerValue(headers, "cookie");
  for (const token of readAllSessionCookies(cookieHeader)) {
    const payload = await verifySessionToken(token, cfg);
    if (payload) return { ok: true, payload, via: "cookie" };
  }
  return { ok: false, reason: "no_session" };
}

// ─── JWKS-aware verification (zero env vars · zero JWK handling) ─────────
//
// verifyOcToken / getOcSession are the integrator-facing verification
// primitives. They lazy-fetch the auth host's published JWKS at
// `<issuer>/.well-known/jwks.json` and cache it in-process. Integrators
// install @orangecheck/me-client (which re-exports these), call
// `verifyOcToken(token)` or `getOcSession(headers)`, and never see a
// JWK string, an env var, or a base64 dance.

const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour
/** How old a key list may be and still stand in for one that can't be fetched. */
const DEFAULT_JWKS_MAX_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

interface JwksCacheEntry {
  keys: Record<string, AuthKey>;
  /** kid → unix seconds, for keys published as `status: "retired"`. */
  retiredAt: Record<string, number>;
  fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const inflight = new Map<string, Promise<JwksCacheEntry>>();
/** Issuers whose latest key-set fetch failed: an unknown kid there can't be told from a new key. */
const jwksFailing = new Set<string>();

/**
 * When each issuer last had its cache force-refreshed by an unrecognised
 * `kid`, and how long that path must wait before doing it again.
 *
 * Without this, a token carrying any unknown kid makes the verifier drop its
 * cache and fetch the JWKS again — so a stream of tokens with random kids turns
 * every integrator's server into a refetch amplifier pointed at the auth host,
 * and puts a network round-trip in front of each rejection. `inflight` only
 * collapses CONCURRENT fetches; sequential requests each got their own.
 *
 * A minute is far below any real rotation window, so a genuinely new key is
 * still picked up promptly — the bust exists for rotation, not for every
 * malformed token.
 */
const lastForcedRefresh = new Map<string, number>();
const FORCED_REFRESH_MIN_INTERVAL_MS = 60_000;
/** A host that takes the connection and never answers would otherwise hold each request for minutes. */
const JWKS_FETCH_TIMEOUT_MS = 10_000;

interface JwksJson {
  keys: Array<Record<string, unknown> & { kid?: string }>;
}

async function fetchJwks(
  issuer: string,
  ttlMs: number,
  maxStaleMs: number = DEFAULT_JWKS_MAX_STALE_MS,
): Promise<JwksCacheEntry> {
  const cached = jwksCache.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached;
  const existing = inflight.get(issuer);
  if (existing) return existing;
  const p = (async (): Promise<JwksCacheEntry> => {
    try {
      const url = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(
          `[@orangecheck/auth-core] JWKS fetch ${url} returned ${res.status}`,
        );
      }
      const json = (await res.json()) as JwksJson;
      if (!json || !Array.isArray(json.keys)) {
        throw new Error(
          `[@orangecheck/auth-core] JWKS at ${url} did not return {keys:[…]}`,
        );
      }
      const keys: Record<string, AuthKey> = {};
      const retiredAt: Record<string, number> = {};
      for (const k of json.keys) {
        if (typeof k.kid !== "string") continue;
        try {
          keys[k.kid] = (await importJWK(k, JWT_ALG)) as AuthKey;
        } catch {
          /* skip keys that won't import for our alg */
          continue;
        }
        if (k.status === "retired") {
          // A retired key with no readable retirement time signs nothing.
          retiredAt[k.kid] =
            typeof k.retired_at === "number" ? k.retired_at : 0;
        }
      }
      // No key this verifier can use is a misdeploy at the host, not a reason to refuse every token.
      if (Object.keys(keys).length === 0) {
        throw new Error(
          `[@orangecheck/auth-core] JWKS at ${url} has no ${JWT_ALG} key`,
        );
      }
      const entry: JwksCacheEntry = { keys, retiredAt, fetchedAt: Date.now() };
      jwksCache.set(issuer, entry);
      jwksFailing.delete(issuer);
      return entry;
    } catch (err) {
      jwksFailing.add(issuer);
      // Stale-on-error: a transient JWKS outage shouldn't lock out
      // every consumer, so an expired entry keeps answering — but only
      // until it is `maxStaleMs` old. A key the auth host removed must
      // stop verifying even while its key list can't be fetched.
      const stale = jwksCache.get(issuer);
      if (stale && Date.now() - stale.fetchedAt < maxStaleMs) return stale;
      throw err;
    }
  })().finally(() => {
    inflight.delete(issuer);
  });
  inflight.set(issuer, p);
  return p;
}

function assertSafeIssuer(issuer: string): void {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(
      `[@orangecheck/auth-core] issuer must be an absolute URL, got ${issuer}`,
    );
  }
  // Allow http only for loopback / local dev. Any production-shaped
  // hostname (real DNS) is required to be https — JWKS fetched over
  // plaintext HTTP is trivially MITM-able and would defeat the whole
  // verification stack.
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !isLoopback) {
    throw new Error(
      `[@orangecheck/auth-core] issuer must be https (got ${url.protocol}//${url.hostname}); plaintext JWKS is not safe`,
    );
  }
}

export interface VerifyOcOptions {
  /** Auth host issuer. Defaults to https://ochk.io. */
  issuer?: string;
  /** JWKS cache TTL in ms. Defaults to 1 hour. Stale-on-error: if the
   *  cache exists, verification still works during a transient outage. */
  jwksCacheTtlMs?: number;
  /** How old a cached JWKS may be and still stand in during an outage.
   *  Defaults to 6 hours; past it, verification fails closed. */
  jwksMaxStaleMs?: number;
  /** Accepted `aud` · see AudienceRule. An integrator verifying tokens from
   *  the sign-in popup sets this to its own origin, e.g.
   *  `"https://example.com"`, so a token issued to another site is refused. */
  audience?: AudienceRule;
}

/** The options {@link verifyOcToken} and {@link getOcSession} read. */
const VERIFY_OC_OPTIONS: ReadonlySet<string> = new Set<keyof VerifyOcOptions>([
  "issuer",
  "jwksCacheTtlMs",
  "jwksMaxStaleMs",
  "audience",
]);
/**
 * Read by @orangecheck/me-client, which up to 0.38.2 passes its own options
 * through to {@link getOcSession}. Accepted and not read here.
 */
const ME_CLIENT_OPTIONS: ReadonlySet<string> = new Set([
  "method",
  "projectKey",
  "meOrigin",
  "revocation",
  "required",
  "requireBond",
]);

/**
 * A token's verification, telling a bad token from a key set that can't be
 * read: `unavailable` when the issuer's JWKS can't be fetched and no copy
 * younger than `jwksMaxStaleMs` is held. That is an outage, not a refusal:
 * answer it 503 so the client tries again, never as "signed out".
 */
export type OcTokenCheck =
  | { status: "valid"; session: SessionPayload }
  | { status: "invalid" }
  | { status: "unavailable" };

const INVALID: OcTokenCheck = { status: "invalid" };

/**
 * {@link verifyOcToken}, telling "invalid" from "can't tell right now"
 * (see {@link OcTokenCheck}). Throws on an option it does not read, or an issuer it may not fetch from.
 */
export async function checkOcToken(
  token: string,
  options: VerifyOcOptions = {},
): Promise<OcTokenCheck> {
  refuseUnknownOptions("checkOcToken", options, VERIFY_OC_OPTIONS, ME_CLIENT_OPTIONS);
  const issuer = options.issuer ?? DEFAULT_ISSUER;
  const ttl = options.jwksCacheTtlMs ?? DEFAULT_JWKS_TTL_MS;
  const maxStale = options.jwksMaxStaleMs ?? DEFAULT_JWKS_MAX_STALE_MS;
  // A mistake in the call: answering invalid would sign out every user.
  assertSafeIssuer(issuer);
  let entry: JwksCacheEntry;
  try {
    // Fast path: try the cache. If the kid isn't in the cache (e.g.
    // brand-new key just rotated in), fall through to a fresh fetch.
    entry = await fetchJwks(issuer, ttl, maxStale);
  } catch {
    return { status: "unavailable" };
  }
  try {
    const headerB64 = token.split(".")[0];
    if (!headerB64) return INVALID;
    const headerJson =
      typeof Buffer !== "undefined"
        ? Buffer.from(headerB64, "base64url").toString("utf8")
        : new TextDecoder().decode(base64UrlDecode(headerB64));
    const header = JSON.parse(headerJson) as { kid?: string; alg?: string };
    if (!header.kid) return INVALID;
    let key = entry.keys[header.kid];
    if (!key) {
      // Force a fresh JWKS fetch in case the integrator's cache is older
      // than the active key set on the auth host — but at most once a
      // minute per issuer, so an unknown kid cannot be used to drive
      // unbounded refetches (see lastForcedRefresh).
      const now = Date.now();
      const last = lastForcedRefresh.get(issuer) ?? 0;
      if (now - last >= FORCED_REFRESH_MIN_INTERVAL_MS) {
        lastForcedRefresh.set(issuer, now);
        // TTL 0 refetches while keeping the cached list as the stand-in.
        try {
          entry = await fetchJwks(issuer, 0, maxStale);
        } catch {
          return { status: "unavailable" };
        }
        key = entry.keys[header.kid];
      }
    }
    // A key may have rotated in while the key set can't be fetched: that is an
    // outage, not a token the set does not know.
    if (!key) return jwksFailing.has(issuer) ? { status: "unavailable" } : INVALID;
    // A trailing slash on the issuer asked for names the same issuer.
    const bare = issuer.replace(/\/+$/, "");
    const res = await jwtVerify(token, key, {
      algorithms: [JWT_ALG],
      issuer: bare === issuer ? issuer : [issuer, bare],
    });
    const p = res.payload as SessionPayload;
    if (!p.sub || !p.did_oc || !p.jti) return INVALID;
    // A retired key vouches only for what it signed before it retired.
    const retiredAt = entry.retiredAt[header.kid];
    if (retiredAt !== undefined && !(typeof p.iat === "number" && p.iat < retiredAt)) {
      return INVALID;
    }
    if (!audienceSatisfied(p.aud, options.audience)) return INVALID;
    if (!handleBoundToOneAudience(p)) return INVALID;
    return { status: "valid", session: p };
  } catch {
    return INVALID;
  }
}

/**
 * Verify a JWT issued by an OC auth host. Lazy-fetches the JWKS from
 * `<issuer>/.well-known/jwks.json`, picks the key whose `kid` matches
 * the token's protected header, and verifies the signature.
 *
 * Returns the payload on success, `null` on any failure (bad signature,
 * expired, wrong issuer, kid not in JWKS, malformed, or a JWKS that can't be
 * read: {@link checkOcToken} tells that last one apart). Throws only on an
 * option it does not read.
 *
 * Integrators don't need to handle JWKs, env vars, or rotation — the
 * cache picks up new keys automatically when they appear in the JWKS
 * response. A key published with `status: "retired"` verifies only tokens
 * issued before its `retired_at`; a key removed from the JWKS stops
 * verifying once the cache refreshes, and an unreachable JWKS is stood in
 * for by the last one fetched for at most `jwksMaxStaleMs`.
 */
export async function verifyOcToken(
  token: string,
  options: VerifyOcOptions = {},
): Promise<SessionPayload | null> {
  refuseUnknownOptions("verifyOcToken", options, VERIFY_OC_OPTIONS, ME_CLIENT_OPTIONS);
  let checked: OcTokenCheck;
  try {
    checked = await checkOcToken(token, options);
  } catch {
    return null; // an issuer it may not fetch from
  }
  return checked.status === "valid" ? checked.session : null;
}

export interface SessionRequestHeaders {
  cookie?: string | null;
  authorization?: string | null;
}

/**
 * Verify the OC session for a request. Accepts either a plain object
 * with `cookie` / `authorization` properties (Express / Next.js / etc.)
 * or a Web Headers object (Hono / edge / Fetch API). Reads the session
 * from the Cookie header first; falls back to a `Authorization: Bearer
 * <token>` header so cross-domain integrators (different eTLD+1, no
 * .ochk.io cookie) can verify the same way.
 *
 * Returns `null` for unauthenticated, missing, or invalid requests.
 * Throws only on an option it does not read.
 */
export async function getOcSession(
  headers: SessionRequestHeaders | Headers,
  options: VerifyOcOptions = {},
): Promise<SessionPayload | null> {
  refuseUnknownOptions("getOcSession", options, VERIFY_OC_OPTIONS, ME_CLIENT_OPTIONS);
  const token = readOcSessionToken(headers);
  if (!token) return null;
  return verifyOcToken(token, options);
}

/**
 * The token a request carries, as {@link getOcSession} reads it: the
 * `oc_session` cookie first, then `Authorization: Bearer <token>`. Null when
 * it carries neither. Pure: verifies nothing.
 */
export function readOcSessionToken(headers: SessionRequestHeaders | Headers): string | null {
  const cookie = isHeaders(headers)
    ? headers.get("cookie")
    : (headers.cookie ?? null);
  const authorization = isHeaders(headers)
    ? headers.get("authorization")
    : (headers.authorization ?? null);
  const token = readSessionCookie(cookie);
  if (token) return token;
  if (typeof authorization === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(authorization);
    if (m) return m[1]!;
  }
  return null;
}

function isHeaders(value: unknown): value is Headers {
  return (
    typeof Headers !== "undefined" &&
    value !== null &&
    typeof value === "object" &&
    value instanceof Headers
  );
}

/**
 * Clear the module-level JWKS caches. Test-only — the caches are process-wide
 * by design (that is the point of them), which makes any test that touches
 * verification order-dependent without a reset.
 */
export function _resetJwksCachesForTests(): void {
  jwksCache.clear();
  inflight.clear();
  lastForcedRefresh.clear();
  jwksFailing.clear();
}

export * from "./revocation";
