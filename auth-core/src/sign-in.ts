// How and when a sign-in happened, as the auth host writes it on a session and
// on every token minted from one. Imports nothing.

/**
 * The ceremonies a sign-in can name in its `amr` claim. The claim follows
 * OpenID Connect (RFC 8176); the values are orangecheck's: `bip322` a Bitcoin
 * wallet's signature, `passkey` a passkey assertion, `email` a code sent to the
 * address, `google` and `github` that provider's sign-in.
 */
export const AUTH_METHODS = ["bip322", "passkey", "email", "google", "github"] as const;

export type AuthMethod = (typeof AUTH_METHODS)[number];

/** What a token says of its sign-in. Null for a fact it does not state clearly. */
export interface SignInFacts {
  /** Every ceremony of the sign-in. Null when absent, empty, repeated or naming one outside {@link AUTH_METHODS}. */
  amr: AuthMethod[] | null;
  /** Unix seconds of the sign-in. Null when absent or not a whole number of seconds. */
  auth_time: number | null;
}

const KNOWN: ReadonlySet<string> = new Set(AUTH_METHODS);

/**
 * A token's sign-in facts. A token minted before the auth host wrote them
 * states neither: null means "not known", and no requirement is met by it.
 */
export function readSignInFacts(payload: { amr?: unknown; auth_time?: unknown }): SignInFacts {
  return { amr: readAmr(payload.amr), auth_time: readTime(payload.auth_time) };
}

function readAmr(value: unknown): AuthMethod[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((m) => typeof m === "string" && KNOWN.has(m))) return null;
  return new Set(value).size === value.length ? ([...value] as AuthMethod[]) : null;
}

function readTime(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}


/** What a caller requires of a sign-in: every ceremony in `amr`, and an `auth_time` at most `maxAge` seconds ago. */
export interface SignInRequirement {
  amr?: readonly AuthMethod[];
  maxAge?: number;
}

/** How far ahead of the checker's clock a token's `auth_time` may be. */
export const AUTH_TIME_SKEW_SECS = 60;

const REQUIREMENT_KEYS: ReadonlySet<string> = new Set(["amr", "maxAge"]);

/**
 * `requirement` as {@link satisfiesSignInRule} reads it. Throws on one it
 * cannot read: not an object, a key other than `amr` and `maxAge`, a method
 * outside {@link AUTH_METHODS}, or a `maxAge` that is not a whole number of
 * seconds from 0. A misspelt key would otherwise require nothing.
 */
export function parseSignInRequirement(requirement: unknown): { amr: AuthMethod[]; maxAge?: number } {
  if (requirement === null || typeof requirement !== "object" || Array.isArray(requirement)) {
    throw new TypeError("@orangecheck/auth-core: a sign-in requirement must be an object");
  }
  const unknown = Object.keys(requirement).filter((k) => !REQUIREMENT_KEYS.has(k));
  if (unknown.length > 0) {
    throw new TypeError(`@orangecheck/auth-core: a sign-in requirement reads only amr and maxAge, not ${unknown.join(", ")}`);
  }
  const { amr = [], maxAge } = requirement as { amr?: unknown; maxAge?: unknown };
  if (!Array.isArray(amr) || !amr.every((m) => typeof m === "string" && KNOWN.has(m))) {
    throw new TypeError(`@orangecheck/auth-core: a sign-in requirement's amr lists only ${AUTH_METHODS.join(", ")}`);
  }
  if (maxAge !== undefined && !(typeof maxAge === "number" && Number.isSafeInteger(maxAge) && maxAge >= 0)) {
    throw new TypeError("@orangecheck/auth-core: a sign-in requirement's maxAge is whole seconds from 0");
  }
  return maxAge === undefined ? { amr: [...amr] as AuthMethod[] } : { amr: [...amr] as AuthMethod[], maxAge };
}

/**
 * Whether a token's sign-in meets `requirement` at `now`, in Unix seconds. A
 * fact the token does not state meets nothing, so a token minted before the
 * facts were written meets any requirement but an empty one. Throws on a
 * requirement {@link parseSignInRequirement} refuses, or a `now` that is not a
 * finite number.
 */
export function satisfiesSignInRule(
  payload: { amr?: unknown; auth_time?: unknown },
  requirement: SignInRequirement,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  const { amr, maxAge } = parseSignInRequirement(requirement);
  if (!Number.isFinite(now)) throw new TypeError("@orangecheck/auth-core: now must be Unix seconds");
  const facts = readSignInFacts(payload);
  if (amr.length > 0 && !amr.every((m) => facts.amr?.includes(m))) return false;
  if (maxAge === undefined) return true;
  if (facts.auth_time === null || facts.auth_time > now + AUTH_TIME_SKEW_SECS) return false;
  return now - facts.auth_time <= maxAge;
}
