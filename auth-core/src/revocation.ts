// ─── Family-wide session revocation ─────────────────────────────────────
//
// A session token verifies by signature alone, so a site that checks only the
// signature honours a token for its whole life, even after it was signed out,
// replaced, or its account deleted. The auth host publishes the sessions that
// ended at `<issuer>/api/auth/revocations`, to sites holding a feed token. This
// check fetches that list at most once per `ttlMs` per process and answers from
// memory, so a request never waits on the host while the copy is fresh.
//
// Entries are keyed by a truncated hash, so the list names no account:
//   - a token, by `ocrev1:jti:<jti>`: that token is ended.
//   - an account, by `ocrev1:sub:<sub>`, with a cutoff: every token of that
//     account issued before it (`iat < cutoff`) is ended.

/** The claims a revocation decision reads. A verified session payload has them all. */
import { refuseUnknownOptions } from "./options";

export interface RevocableClaims {
  jti?: unknown;
  sub?: unknown;
  iat?: unknown;
  /** An audience-bound token's revocation handle, looked up in a list's `handles`. */
  rh?: unknown;
  aud?: unknown;
}

/**
 * `live`: not ended, per a copy of the list fresh enough to vouch for it.
 * `revoked`: ended. `unverified`: not known to be ended, but the copy is too
 * old (or was never fetched) to say so for a request that changes state.
 */
export type RevocationStatus = "live" | "revoked" | "unverified";

export interface RevocationCheck {
  status(claims: RevocableClaims): Promise<RevocationStatus>;
  /**
   * Whether to refuse the session for a request with this method: always when
   * revoked, and for an unsafe method (or none given) when unverified. Reads
   * keep working through an outage of the auth host; writes stop.
   */
  refuses(claims: RevocableClaims, method?: string): Promise<boolean>;
}

export interface RevocationCheckOptions {
  /** Default `${OC_AUTH_ISSUER ?? "https://ochk.io"}/api/auth/revocations`. */
  url?: string;
  /** This site's feed token. Default `OC_REVOCATION_FEED_TOKEN`. */
  token?: string;
  /**
   * Headers for each fetch, in place of the feed token: an integrator's
   * request signed with its project secret ({@link integratorRevocationCheck}).
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** How long a copy is used before fetching again. Default 60 s. */
  ttlMs?: number;
  /** Past this age a copy cannot vouch for a write. Default 10 min. */
  maxStaleMs?: number;
  /**
   * What a copy's age is measured from: when this process fetched it
   * (`"fetch"`, the default), or the list's own `at` (`"at"`), so a list
   * that was already old when served is not taken for a fresh one. With
   * `"at"`, a list dated more than `skewMs` ahead cannot vouch either.
   */
  staleFrom?: "fetch" | "at";
  /** Clock difference tolerated between the list's `at` and this host. Default 60 s. */
  skewMs?: number;
  /** One fetch's time limit. Default 3 s. */
  timeoutMs?: number;
  /** After a failed fetch, how long to wait before the next. Default 10 s. */
  retryMs?: number;
  /**
   * With no token: true answers `live` (local development and tests, where no
   * feed exists); false answers `unverified`, so writes are refused. Default:
   * true unless NODE_ENV is production.
   */
  developing?: boolean;
  fetch?: typeof fetch;
  /** The wall clock, ms: what the list's own `at` is read against. Default `Date.now`. */
  now?: () => number;
  /**
   * A clock that never steps back, ms. A copy's age and the wait after a
   * failed fetch are the longer of the time on it and on the wall clock, so
   * neither a wall clock set back nor a pause this clock slept through (a
   * suspended host) can extend them. Default `performance.now()`; when only
   * `now` is given, `now`.
   */
  clock?: () => number;
}

interface Snapshot {
  tokens: Set<string>;
  accounts: Map<string, number>;
  handles: Map<string, number>;
  /** The list's own time, unix seconds, when it says. */
  at: number | null;
  /** When this process fetched it, on the monotonic clock. */
  fetchedAt: number;
  /** When this process fetched it, on the wall clock. */
  wallAtFetch: number;
  /** How old the list already was when fetched, by the wall clock, ms. */
  ageAtFetch: number;
}

/** Methods that only read: they go on while the list can't vouch for a session. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_STALE_MS = 10 * 60_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_RETRY_MS = 10_000;
const DEFAULT_SKEW_MS = 60_000;

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/**
 * The feed key for a token (`kind: "jti"`) or an account (`kind: "sub"`):
 * base64url of the first 16 bytes of sha256(`ocrev1:<kind>:<value>`). The
 * auth host derives the same; its tests share these vectors.
 */
export async function revocationKey(
  kind: "jti" | "sub",
  value: string,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ocrev1:${kind}:${value}`),
  );
  let bin = "";
  for (const b of new Uint8Array(digest).subarray(0, 16)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A map of feed key to cutoff, every cutoff a finite number, or a thrown feed error. */
function cutoffs(raw: unknown, name: string): Map<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`revocation feed: ${name} is not a map`);
  }
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`revocation feed: a cutoff in ${name} is not a number`);
    }
    out.set(k, v);
  }
  return out;
}

// Anything it cannot read in full is a feed error, never "nothing ended": an
// entry dropped here would leave a session it ended live.
function parseFeed(
  body: unknown,
  fetchedAt: number,
  wallAtFetch: number,
  needHandles: boolean,
): Snapshot {
  const b = body as { v?: unknown; at?: unknown; tokens?: unknown; accounts?: unknown; handles?: unknown } | null;
  if (!b || b.v !== 1 || !Array.isArray(b.tokens)) {
    throw new Error("revocation feed: unexpected body");
  }
  if (!b.tokens.every((t) => typeof t === "string")) {
    throw new Error("revocation feed: a token key is not a string");
  }
  const tokens = new Set<string>(b.tokens as string[]);
  const accounts = cutoffs(b.accounts, "accounts");
  // The family list carries no handles; an integrator's list always does.
  const handles = b.handles === undefined && !needHandles ? new Map<string, number>() : cutoffs(b.handles, "handles");
  const at = typeof b.at === "number" && Number.isFinite(b.at) ? b.at : null;
  const ageAtFetch = at === null ? Infinity : wallAtFetch - at * 1000;
  return { tokens, accounts, handles, at, fetchedAt, wallAtFetch, ageAtFetch };
}

/**
 * A revocation check with its own cached copy of the feed. Create one per
 * process and share it (fluid compute keeps module state across requests);
 * {@link familyRevocationCheck} is that one, configured from the environment.
 */
/** The options {@link createRevocationCheck} reads. */
const REVOCATION_CHECK_OPTIONS: ReadonlySet<string> = new Set<keyof RevocationCheckOptions>([
  "url",
  "token",
  "headers",
  "ttlMs",
  "maxStaleMs",
  "staleFrom",
  "skewMs",
  "timeoutMs",
  "retryMs",
  "developing",
  "fetch",
  "now",
  "clock",
]);

/** The options {@link integratorRevocationCheck} reads. */
const INTEGRATOR_REVOCATION_OPTIONS: ReadonlySet<string> = new Set<keyof IntegratorRevocationOptions>([
  "projectKey",
  "signingSecret",
  "meOrigin",
  "ttlMs",
  "maxStaleMs",
  "skewMs",
  "timeoutMs",
  "retryMs",
  "fetch",
  "now",
  "clock",
]);

export function createRevocationCheck(opts: RevocationCheckOptions = {}): RevocationCheck {
  refuseUnknownOptions("createRevocationCheck", opts, REVOCATION_CHECK_OPTIONS);
  return buildRevocationCheck(opts, false);
}

function buildRevocationCheck(opts: RevocationCheckOptions, needHandles: boolean): RevocationCheck {
  const issuer = (env("OC_AUTH_ISSUER") ?? "https://ochk.io").replace(/\/$/, "");
  const url = opts.url ?? env("OC_REVOCATION_FEED_URL") ?? `${issuer}/api/auth/revocations`;
  const token = opts.token ?? env("OC_REVOCATION_FEED_TOKEN")?.trim();
  const signer = opts.headers;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxStaleMs = opts.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
  const staleFrom = opts.staleFrom ?? "fetch";
  const skewMs = opts.skewMs ?? DEFAULT_SKEW_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;
  const developing = opts.developing ?? env("NODE_ENV") !== "production";
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const clock = opts.clock ?? (opts.now ? opts.now : () => performance.now());

  let snapshot: Snapshot | null = null;
  let inflight: Promise<void> | null = null;
  let failedAt = -Infinity;
  let failedWall = -Infinity;
  // Time since a moment stamped on both clocks: the longer reading, so neither a
  // wall clock set back nor a pause the monotonic clock slept through shortens it.
  const since = (mono: number, wall: number) => Math.max(clock() - mono, now() - wall);
  let warned = false;
  const warn = (msg: string) => {
    if (warned) return;
    warned = true;
    console.warn(`[@orangecheck/auth-core] ${msg}`);
  };

  async function load(): Promise<void> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const credential = signer ? await signer() : { authorization: `Bearer ${token}` };
      const res = await doFetch(url, {
        headers: { ...credential, accept: "application/json" },
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`revocation feed answered ${res.status}`);
      snapshot = parseFeed(await res.json(), clock(), now(), needHandles);
      warned = false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function current(): Promise<Snapshot | null> {
    if (snapshot && since(snapshot.fetchedAt, snapshot.wallAtFetch) < ttlMs) return snapshot;
    if (since(failedAt, failedWall) < retryMs) return snapshot;
    inflight ??= load()
      .catch((err: unknown) => {
        failedAt = clock();
        failedWall = now();
        warn(`${err instanceof Error ? err.message : String(err)}; using the last copy`);
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
    return snapshot;
  }

  async function status(claims: RevocableClaims): Promise<RevocationStatus> {
    if (!token && !signer) {
      if (developing) return "live";
      warn("OC_REVOCATION_FEED_TOKEN is not set; sessions cannot be checked for revocation");
      return "unverified";
    }
    const snap = await current();
    if (!snap) return "unverified";
    // A token known to be ended stays ended, however old the copy.
    if (typeof claims.jti === "string" && snap.tokens.has(await revocationKey("jti", claims.jti))) {
      return "revoked";
    }
    if (typeof claims.sub === "string" && snap.accounts.size > 0) {
      const cutoff = snap.accounts.get(await revocationKey("sub", claims.sub));
      if (cutoff !== undefined && !(typeof claims.iat === "number" && claims.iat >= cutoff)) {
        return "revoked";
      }
    }
    if (typeof claims.rh === "string" && snap.handles.size > 0) {
      const cutoff = snap.handles.get(claims.rh);
      if (cutoff !== undefined && !(typeof claims.iat === "number" && claims.iat >= cutoff)) {
        return "revoked";
      }
    }
    return tooOld(snap) ? "unverified" : "live";
  }

  function tooOld(snap: Snapshot): boolean {
    if (staleFrom === "fetch") return since(snap.fetchedAt, snap.wallAtFetch) > maxStaleMs;
    if (snap.at === null) return true;
    const at = snap.at * 1000;
    // Dated ahead of this clock: judged on each call, so it ends once the clock catches up.
    if (at > now() + skewMs) return true;
    // The list's age by its own time: its age when fetched grown on the monotonic
    // clock, or read against the wall clock now, whichever is longer.
    return Math.max(snap.ageAtFetch + (clock() - snap.fetchedAt), now() - at) > maxStaleMs;
  }

  return {
    status,
    async refuses(claims, method) {
      const s = await status(claims);
      if (s === "revoked") return true;
      if (s === "live") return false;
      return !SAFE_METHODS.has((method ?? "").toUpperCase());
    },
  };
}

export interface IntegratorRevocationOptions
  extends Omit<RevocationCheckOptions, "url" | "token" | "headers" | "developing" | "staleFrom"> {
  /** Default `OC_PROJECT_KEY`. */
  projectKey?: string;
  /** Default `OC_SIGNING_SECRET`. */
  signingSecret?: string;
  /** Default `OC_ME_ORIGIN`, else `https://me.ochk.io`. */
  meOrigin?: string;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * For an integrator's server: refuse a session the person ended everywhere
 * (sign out everywhere, a passkey removed, the account deleted). A token from
 * the sign-in popup carries `rh`, its revocation handle for its own audience;
 * this looks it up in me.ochk.io's list of ended handles for that audience
 * (`/api/integrator/revocations`), fetched at most once a minute per audience
 * with a request signed by the project secret over method, path and audience.
 * A token without `rh` is checked by its signature alone. Staleness is
 * measured from the list's own `at`. Null when the project key or secret is
 * not set: a site that has not configured it keeps verifying by signature
 * alone rather than refusing writes.
 *
 * Call it with a session `verifyOcToken` has already accepted: the audience
 * it looks up is the token's own `aud`, sent exactly as minted.
 */
export function integratorRevocationCheck(
  opts: IntegratorRevocationOptions = {},
): RevocationCheck | null {
  refuseUnknownOptions("integratorRevocationCheck", opts, INTEGRATOR_REVOCATION_OPTIONS);
  const { projectKey: pk, signingSecret, meOrigin, ...rest } = opts;
  const projectKey = (pk ?? env("OC_PROJECT_KEY"))?.trim();
  const secret = (signingSecret ?? env("OC_SIGNING_SECRET"))?.trim();
  if (!projectKey || !secret) return null;
  const origin = (meOrigin ?? env("OC_ME_ORIGIN") ?? "https://me.ochk.io").replace(/\/$/, "");
  const now = rest.now ?? Date.now;
  const lists = new Map<string, RevocationCheck>();
  const listFor = (aud: string): RevocationCheck => {
    let check = lists.get(aud);
    if (!check) {
      const path = `/api/integrator/revocations?project_key=${encodeURIComponent(projectKey)}&aud=${encodeURIComponent(aud)}`;
      check = buildRevocationCheck({
        ...rest,
        url: `${origin}${path}`,
        headers: async () => {
          const t = Math.floor(now() / 1000);
          return { "x-oc-signature": `t=${t},v1=${await hmacHex(secret, `${t}.GET ${path}`)}` };
        },
        developing: false,
        staleFrom: "at",
      }, true);
      lists.set(aud, check);
    }
    return check;
  };
  const handled = (c: RevocableClaims): c is RevocableClaims & { rh: string; aud: string } =>
    typeof c.rh === "string" && c.rh.length > 0 && typeof c.aud === "string" && c.aud.length > 0;
  // A handle is looked up on its audience's list, so one that is not a
  // non-empty string, or comes without one string aud, is never live.
  const unsound = (c: RevocableClaims) => c.rh !== undefined && !handled(c);
  return {
    async status(claims) {
      if (unsound(claims)) return "revoked";
      return handled(claims) ? listFor(claims.aud).status(claims) : "live";
    },
    async refuses(claims, method) {
      if (unsound(claims)) return true;
      return handled(claims) ? listFor(claims.aud).refuses(claims, method) : false;
    },
  };
}

const SHARED = Symbol.for("@orangecheck/auth-core/revocation-check/v1");

/**
 * The process-wide check, configured from the environment
 * (`OC_REVOCATION_FEED_TOKEN`, `OC_AUTH_ISSUER`). Every reader in a site
 * should use this one, so the site fetches the feed once per minute, not once
 * per reader.
 */
export function familyRevocationCheck(): RevocationCheck {
  const g = globalThis as { [SHARED]?: RevocationCheck };
  return (g[SHARED] ??= createRevocationCheck());
}

/** Tests only: drop the process-wide check so the next call reads the environment again. */
export function _resetFamilyRevocationCheckForTests(): void {
  delete (globalThis as { [SHARED]?: RevocationCheck })[SHARED];
}
