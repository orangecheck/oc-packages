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
