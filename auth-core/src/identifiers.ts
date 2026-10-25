// Two rules every family repo applies, kept in one place. This entry imports
// nothing, so a browser bundle can take it. sdk-py's `orangecheck.identifiers`
// answers the same for every input in test-vectors/identifiers.json.

const DID_OC = /^did:oc:[0-9a-f]{32}$/;

/** A string isDidOc has accepted. Narrower than string, so a string it refuses stays a string. */
export type DidOc = `did:oc:${string}`;

/**
 * Is `value` a did:oc: `did:oc:` and 32 lowercase hex digits, with nothing
 * before or after it? Upper case, surrounding space and a trailing newline are
 * all refused; trim or lower-case first only where you mean to.
 */
export function isDidOc(value: unknown): value is DidOc {
  return typeof value === "string" && DID_OC.test(value);
}

/**
 * The form an email address is stored, hashed and looked up in: trimmed of
 * surrounding whitespace, then lower-cased. Every sign-in code, linked address
 * and Connect claim uses it, so a change here moves every stored lookup.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
