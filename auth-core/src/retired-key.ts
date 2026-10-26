/** The longest any token ochk.io signs is valid, `exp - iat`: a session's 30 days. */
export const TOKEN_MAX_LIFETIME_SEC = 30 * 24 * 60 * 60;

/**
 * Does a key retired at `retiredAt` (unix seconds) still vouch for a token with
 * these claims? Only for one it signed before it retired, valid for no longer
 * than ochk.io lets any token live. `iat` and `exp` are both the signer's own
 * word, so the lifetime bound is what ends a retired key's tokens:
 * none outlives `retiredAt + TOKEN_MAX_LIFETIME_SEC`.
 */
export function retiredKeyVouches(
  claims: { iat?: unknown; exp?: unknown },
  retiredAt: number,
): boolean {
  const { iat, exp } = claims;
  if (typeof iat !== "number" || typeof exp !== "number") return false;
  const lifetime = exp - iat;
  return iat < retiredAt && lifetime > 0 && lifetime <= TOKEN_MAX_LIFETIME_SEC;
}
