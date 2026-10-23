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
}
