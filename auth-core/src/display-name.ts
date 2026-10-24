/**
 * The family's rule for a name someone chooses and other people are shown on
 * orangecheck's own pages, notices and email: a project's or a Connect app's
 * name, a team's name, an event's label. One rule, so no writer is laxer than
 * another. The vectors in __tests__/display-name.vectors.json are the test.
 */

/**
 * What can hide or reorder part of a text on a consent screen or in a notice:
 * control and format characters (bidi embeddings, overrides and isolates,
 * zero-width marks, soft hyphens, tags), lone surrogates, and the fillers that
 * render as nothing. Variation selectors stay: they only pick a glyph.
 */
export const HIDDEN_TEXT_CHARS =
  /[\p{Cc}\p{Cf}\p{Cs}\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2800\u3164\uffa0\ufff0-\ufff8\u{e0000}-\u{e00ff}\u{e01f0}-\u{e0fff}]/u;

/** Names only orangecheck itself goes by. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(["orangecheck", "ochk", "ochk.io", "ochk.app"]);

/** True when a name reads as one of orangecheck's own, whatever its case, width, spacing or variation selectors. */
export function isReservedName(value: string): boolean {
  const key = value
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, "");
  return RESERVED_NAMES.has(key);
}

export type NameProblem = "required" | "too_long" | "hidden_characters" | "reserved";

/** Why a name (already trimmed) cannot be stored, or null when it can. */
export function nameProblem(value: string, max: number): NameProblem | null {
  if (!value) return "required";
  if (value.length > max) return "too_long";
  if (HIDDEN_TEXT_CHARS.test(value)) return "hidden_characters";
  if (isReservedName(value)) return "reserved";
  return null;
}
