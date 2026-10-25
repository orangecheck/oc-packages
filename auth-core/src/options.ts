/**
 * Throw on an option a function does not read. Ignored, a misspelt
 * `audience` would read as no audience, which accepts family sessions, and a
 * misspelt `projectKey` would leave the revocation check off.
 */
export function refuseUnknownOptions(
  where: string,
  opts: unknown,
  known: ReadonlySet<string>,
  ignored: ReadonlySet<string> = new Set(),
): void {
  if (opts === null || typeof opts !== "object") {
    throw new TypeError(`@orangecheck/auth-core: ${where} options must be an object`);
  }
  const unknown = Object.keys(opts).filter((k) => !known.has(k) && !ignored.has(k));
  if (unknown.length > 0) {
    throw new TypeError(
      `@orangecheck/auth-core: ${where}: unknown option ${unknown.join(", ")}. ` +
        `It reads only ${[...known].join(", ")}.`,
    );
  }
  // Readers read opts.key, which follows the prototype: a known key must be the caller's own.
  const inherited = [...known].filter((k) => k in opts && !Object.prototype.hasOwnProperty.call(opts, k));
  if (inherited.length > 0) {
    throw new TypeError(`@orangecheck/auth-core: ${where}: option ${inherited.join(", ")} is inherited, not set by the caller`);
  }
}
