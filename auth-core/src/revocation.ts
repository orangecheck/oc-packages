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
export interface RevocableClaims {
  jti?: unknown;
  sub?: unknown;
  iat?: unknown;
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
  /** How long a copy is used before fetching again. Default 60 s. */
  ttlMs?: number;
  /** Past this age a copy cannot vouch for a write. Default 10 min. */
  maxStaleMs?: number;
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
  now?: () => number;
}

interface Snapshot {
  tokens: Set<string>;
  accounts: Map<string, number>;
  fetchedAt: number;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_STALE_MS = 10 * 60_000;
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_RETRY_MS = 10_000;

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

function parseFeed(body: unknown, fetchedAt: number): Snapshot {
  const b = body as { v?: unknown; tokens?: unknown; accounts?: unknown } | null;
  if (!b || b.v !== 1 || !Array.isArray(b.tokens) || typeof b.accounts !== "object" || !b.accounts) {
    throw new Error("revocation feed: unexpected body");
  }
  const tokens = new Set<string>();
  for (const t of b.tokens) if (typeof t === "string") tokens.add(t);
  const accounts = new Map<string, number>();
  for (const [k, v] of Object.entries(b.accounts as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) accounts.set(k, v);
  }
  return { tokens, accounts, fetchedAt };
}

/**
 * A revocation check with its own cached copy of the feed. Create one per
 * process and share it (fluid compute keeps module state across requests);
 * {@link familyRevocationCheck} is that one, configured from the environment.
 */
export function createRevocationCheck(opts: RevocationCheckOptions = {}): RevocationCheck {
  const issuer = (env("OC_AUTH_ISSUER") ?? "https://ochk.io").replace(/\/$/, "");
  const url = opts.url ?? env("OC_REVOCATION_FEED_URL") ?? `${issuer}/api/auth/revocations`;
  const token = opts.token ?? env("OC_REVOCATION_FEED_TOKEN")?.trim();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const maxStaleMs = opts.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;
  const developing = opts.developing ?? env("NODE_ENV") !== "production";
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;

  let snapshot: Snapshot | null = null;
  let inflight: Promise<void> | null = null;
  let failedAt = -Infinity;
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
      const res = await doFetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`revocation feed answered ${res.status}`);
      snapshot = parseFeed(await res.json(), now());
      warned = false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function current(): Promise<Snapshot | null> {
    const t = now();
    if (snapshot && t - snapshot.fetchedAt < ttlMs) return snapshot;
    if (t - failedAt < retryMs) return snapshot;
    inflight ??= load()
      .catch((err: unknown) => {
        failedAt = now();
        warn(`${err instanceof Error ? err.message : String(err)}; using the last copy`);
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
    return snapshot;
  }

  async function status(claims: RevocableClaims): Promise<RevocationStatus> {
    if (!token) {
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
    return now() - snap.fetchedAt > maxStaleMs ? "unverified" : "live";
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
