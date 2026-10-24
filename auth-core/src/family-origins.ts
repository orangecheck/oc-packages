/**
 * The family sites: the origins that may use the shared `oc_session` cookie to
 * change state, and that a sign-in may return to. A name that is not listed is
 * not family, even under .ochk.io: btcpay.ochk.io, relay.ochk.io, a retired or
 * an unclaimed subdomain never inherits a signed-in visitor's session. This file
 * imports nothing, so a browser bundle can take it from
 * `@orangecheck/auth-core/family-origins`.
 */

// The decision reads this frozen list; FAMILY_ORIGINS is a copy to read, so adding to it changes nothing.
const LISTED: readonly string[] = Object.freeze([
  "https://ochk.io",
  "https://me.ochk.io",
  "https://attest.ochk.io",
  "https://lock.ochk.io",
  "https://vote.ochk.io",
  "https://stamp.ochk.io",
  "https://agent.ochk.io",
  "https://pledge.ochk.io",
  "https://vault.ochk.io",
  "https://chat.ochk.io",
  "https://cosign.ochk.io",
  "https://me-demo.ochk.io",
  "https://globe.ochk.io",
  "https://btc.ochk.io",
  "https://analytics.ochk.io",
  "https://bot.ochk.io",
  "https://forge.ochk.io",
]);

export const FAMILY_ORIGINS: ReadonlySet<string> = new Set(LISTED);

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Only an explicit development or test run counts: an unset NODE_ENV is not one.
const isDeveloping = () =>
  typeof process !== "undefined" && (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");

/** Is this origin (scheme, host and port, no path) a family site? Localhost counts only while developing. */
export function isFamilyOrigin(origin: string | undefined, developing = isDeveloping()): boolean {
  if (typeof origin !== "string") return false;
  return LISTED.includes(origin) || (developing && LOCALHOST.test(origin));
}
