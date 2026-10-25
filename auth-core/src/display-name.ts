/**
 * The family's rule for a name someone chooses and other people are shown on
 * orangecheck's own pages, notices and email: a project's or a Connect app's
 * name, a team's name, an event's label. One rule, so no writer is laxer than
 * another. The vectors in test-vectors/display-name.json are the test, here
 * and in sdk-py.
 */

import { CONFUSABLE_PROTOTYPES } from "./confusables";
import { refuseUnknownOptions } from "./options";

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

/** Every start of a reserved name, the whole name included. */
const RESERVED_PREFIXES: ReadonlySet<string> = new Set(
  [...RESERVED_NAMES].flatMap((name) => [...name].map((_, i) => name.slice(0, i + 1))),
);

/** Each character drawn like a letter of a reserved name, to that letter (UTS #39 confusables). */
const PROTOTYPE: ReadonlyMap<string, string> = new Map(
  CONFUSABLE_PROTOTYPES.flatMap(([prototype, sources]) => [...sources].map((ch) => [ch, prototype] as const)),
);

/**
 * The letters one character can read as: its UTS #39 prototype as written,
 * and after NFKC and lower case. As written keeps a capital that lower case
 * would turn into another letter (Greek capital eta is drawn as H, its small
 * form is not). The table holds only look-alikes of the reserved names'
 * letters, which is all a comparison with them needs.
 */
function readings(ch: string): string[] {
  return [ch, ch.normalize("NFKC").toLowerCase()].map((form) =>
    [...form].map((c) => PROTOTYPE.get(c) ?? c).join(""),
  );
}

/** Drops spacing and variation selectors, which change no letter. */
function unspaced(value: string): string {
  return value.replace(/[\s\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, "");
}

/**
 * True when a name reads as one of orangecheck's own, whatever its case,
 * width, spacing or variation selectors, or when it is drawn with letters
 * from another script or digits that look like ours: Cyrillic or Greek o, a,
 * e, c, 0 for o. Read a character at a time, so one script's capitals and
 * another's small letters cannot hide a name between them. Always false
 * with `allowReserved`.
 */
export function isReservedName(value: string, options?: NameRuleOptions): boolean {
  if (readNameOptions("isReservedName", options).allowReserved) return false;
  let spelt: ReadonlySet<string> = new Set([""]);
  for (const ch of unspaced(value)) {
    const next = new Set<string>();
    for (const head of spelt) {
      for (const reading of readings(ch)) if (RESERVED_PREFIXES.has(head + reading)) next.add(head + reading);
    }
    spelt = next;
  }
  return [...spelt].some((name) => RESERVED_NAMES.has(name));
}

export type NameProblem = "required" | "too_long" | "hidden_characters" | "reserved";

export interface NameRuleOptions {
  /**
   * The name is published by orangecheck itself: its signer or owner is in
   * the calling site's owner list. Our own names are then allowed; nothing
   * else changes. Set it from the caller's own records, never from anything
   * the publisher sent.
   */
  allowReserved?: boolean;
}

const NAME_OPTIONS: ReadonlySet<string> = new Set(["allowReserved"]);

function readNameOptions(where: string, options: unknown): { allowReserved: boolean } {
  if (options === undefined) return { allowReserved: false };
  refuseUnknownOptions(where, options, NAME_OPTIONS);
  const { allowReserved } = options as { allowReserved?: unknown };
  if (allowReserved !== undefined && typeof allowReserved !== "boolean") {
    throw new TypeError(`@orangecheck/auth-core: ${where}: allowReserved must be true or false`);
  }
  return { allowReserved: allowReserved === true };
}

/**
 * Why a name (already trimmed) cannot be stored, or null when it can. `max`
 * counts code points, as a reader counts characters and Postgres counts a
 * text column: an emoji is one, not two UTF-16 units. With `allowReserved`
 * (orangecheck's own record), one of our names is not a problem; every other
 * check still applies.
 */
export function nameProblem(value: string, max: number, options?: NameRuleOptions): NameProblem | null {
  const { allowReserved } = readNameOptions("nameProblem", options);
  if (!value) return "required";
  if (value.length > max && [...value].length > max) return "too_long";
  if (HIDDEN_TEXT_CHARS.test(value)) return "hidden_characters";
  if (!allowReserved && isReservedName(value)) return "reserved";
  return null;
}
