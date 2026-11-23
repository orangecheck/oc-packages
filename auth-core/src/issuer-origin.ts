// The one rule for an origin a site names: an auth host's issuer, or where
// me.ochk.io is. sdk-py's `_issuer_origin` answers the same for every input in
// test-vectors/issuer-origin.json.

const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
// A name's last label starts with a letter, so a URL parser never reads it as an IPv4 address.
const HOST = `\\[::1\\]|(?:${OCTET}\\.){3}${OCTET}|(?:${LABEL}\\.)*[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?`;
const ORIGIN = new RegExp(`^(https?)://(${HOST})(?::([1-9][0-9]{0,4}))?$`);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `value` as one origin, `scheme://host[:port]` in lower case, or null for
 * anything else. https, or http on localhost, 127.0.0.1 or [::1] only: keys,
 * tokens and signed requests go there, and plain http elsewhere can be read
 * and changed on the way. One trailing slash is dropped. A path, a query, a
 * fragment, a user name, the scheme's own port, space or any character
 * outside printable ASCII is refused rather than repaired, so every caller in
 * every language sends requests to the same place.
 *
 * Since `@orangecheck/auth-core` 2.34.0.
 */
export function parseIssuerOrigin(value: unknown): string | null {
  if (typeof value !== "string" || !/^[!-~]+$/.test(value)) return null;
  const origin = value.toLowerCase().replace(/\/$/, "");
  const m = ORIGIN.exec(origin);
  if (!m) return null;
  const [, scheme, host, port] = m;
  if (scheme === "http" && !LOOPBACK.has(host!)) return null;
  if (port !== undefined && (Number(port) > 65535 || port === (scheme === "https" ? "443" : "80"))) return null;
  return origin;
}

/**
 * The sentence every refusal of {@link parseIssuerOrigin} carries. Since
 * `@orangecheck/auth-core` 2.34.0.
 */
export const ISSUER_ORIGIN_RULE = "one origin with no path: https, or http on localhost, 127.0.0.1 or [::1]";
