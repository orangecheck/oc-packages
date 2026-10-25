import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONFUSABLE_ALPHABET, CONFUSABLE_PROTOTYPES } from "../confusables";
import { HIDDEN_TEXT_CHARS, isReservedName, nameProblem } from "../index";

// Shared with sdk-py's tests/test_display_name.py, so a Python site and a Node site refuse the same names.
const vectors = JSON.parse(readFileSync(new URL("../../test-vectors/display-name.json", import.meta.url), "utf8")) as {
  reserved: string[];
  confusable: string[];
  allowed: string[];
  hidden: string[];
  lengths: Array<{ name: string; max: number; problem: string | null }>;
  allow_reserved: Array<{ name: string; max: number; problem: string | null }>;
};

describe("the family name rule", () => {
  it("refuses orangecheck's own names, whatever their case, width, spacing or variation selectors", () => {
    for (const name of vectors.reserved) {
      expect(isReservedName(name), JSON.stringify(name)).toBe(true);
      expect(nameProblem(name, 80), JSON.stringify(name)).toBe("reserved");
    }
  });

  it("refuses a name drawn like one of them in another script's letters or in digits (UTS #39)", () => {
    for (const name of vectors.confusable) {
      expect(isReservedName(name), JSON.stringify(name)).toBe(true);
      expect(nameProblem(name, 80), JSON.stringify(name)).toBe("reserved");
    }
  });

  // The table keeps only what can spell a reserved name; a new name with a new letter needs it regenerated.
  it("holds a prototype only from the reserved names' letters, and every letter of theirs", () => {
    for (const [prototype] of CONFUSABLE_PROTOTYPES) {
      expect([...prototype].every((ch) => CONFUSABLE_ALPHABET.includes(ch)), prototype).toBe(true);
    }
    for (const name of vectors.reserved) {
      const letters = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}.]/gu, "");
      expect([...letters].every((ch) => CONFUSABLE_ALPHABET.includes(ch)), JSON.stringify(name)).toBe(true);
    }
  });

  it("keeps the generated table to visible ASCII", () => {
    const source = readFileSync(new URL("../confusables.ts", import.meta.url), "utf8");
    expect([...source].filter((c) => c > "~").map((c) => c.codePointAt(0)!.toString(16))).toEqual([]);
  });

  it("refuses a name that holds one of them as a whole word", () => {
    for (const name of vectors.contains) {
      expect(isReservedName(name), JSON.stringify(name)).toBe(true);
      expect(nameProblem(name, 80), JSON.stringify(name)).toBe("reserved");
    }
  });

  it("allows a name that only resembles one of them, or holds it inside a longer word", () => {
    for (const name of vectors.allowed) {
      expect(nameProblem(name, 80), JSON.stringify(name)).toBeNull();
    }
  });

  // Every word start begins a read, so a read must stop where nothing can still spell a name.
  it("reads a long name in time linear in its length", () => {
    const name = "orange chec ".repeat(2000);
    const started = performance.now();
    expect(isReservedName(name)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("refuses what hides or reorders text, before it can hide a reserved name", () => {
    for (const name of vectors.hidden) {
      expect(HIDDEN_TEXT_CHARS.test(name), JSON.stringify(name)).toBe(true);
      expect(nameProblem(name, 80), JSON.stringify(name)).toBe("hidden_characters");
    }
  });

  // A lone surrogate cannot travel in JSON, so it is built here.
  it("refuses a lone surrogate", () => {
    expect(nameProblem(`Lumen${String.fromCharCode(0xd800)}Notes`, 80)).toBe("hidden_characters");
  });

  // Unassigned code points in the tag block and after the variation selectors
  // render as nothing too; they are not format characters, so they are named.
  it("refuses the unassigned tag and supplement code points", () => {
    for (const cp of [0xe0000, 0xe0080, 0xe00ff, 0xe01f0, 0xe0fff]) {
      expect(nameProblem(`Lumen${String.fromCodePoint(cp)}Notes`, 80), cp.toString(16)).toBe(
        "hidden_characters",
      );
    }
  });

  // The rule's own source names every character by escape, so nothing in it hides from a reviewer.
  it("keeps its own source to visible ASCII", () => {
    const source = readFileSync(new URL("../display-name.ts", import.meta.url), "utf8");
    expect([...source].filter((c) => c > "~").map((c) => c.codePointAt(0)!.toString(16))).toEqual([]);
  });

  // A caller sets allowReserved only for orangecheck's own records; it lifts that one check.
  it("allows our own names to orangecheck itself, and nothing else", () => {
    for (const { name, max, problem } of vectors.allow_reserved) {
      expect(nameProblem(name, max, { allowReserved: true }), JSON.stringify(name)).toBe(problem);
    }
    for (const name of [...vectors.reserved, ...vectors.confusable]) {
      expect(nameProblem(name, 80, { allowReserved: true }), JSON.stringify(name)).toBeNull();
      expect(isReservedName(name, { allowReserved: true }), JSON.stringify(name)).toBe(false);
      expect(nameProblem(name, 80, { allowReserved: false }), JSON.stringify(name)).toBe("reserved");
      expect(isReservedName(name, {}), JSON.stringify(name)).toBe(true);
    }
    for (const name of vectors.hidden) {
      expect(nameProblem(name, 80, { allowReserved: true }), JSON.stringify(name)).toBe("hidden_characters");
    }
  });

  it("refuses an option it does not read, or one that is not true or false", () => {
    expect(() => nameProblem("ochk", 80, { allowReserve: true } as never)).toThrow(/unknown option allowReserve/);
    expect(() => isReservedName("ochk", { allowreserved: true } as never)).toThrow(/unknown option/);
    expect(() => nameProblem("ochk", 80, { allowReserved: "yes" } as never)).toThrow(/true or false/);
    expect(() => isReservedName("ochk", { allowReserved: 1 } as never)).toThrow(/true or false/);
    expect(() => nameProblem("ochk", 80, null as never)).toThrow(/must be an object/);
    // The option is read before the name, so an empty name still reports a bad option.
    expect(() => nameProblem("", 80, { allowReserved: "yes" } as never)).toThrow(/true or false/);
    expect(() => nameProblem("", 80, { allowReserve: true } as never)).toThrow(/unknown option/);
  });

  it("lifts nothing for an allowReserved the caller did not set itself", () => {
    expect(() => nameProblem("ochk", 80, Object.create({ allowReserved: true }))).toThrow(/inherited/);
    expect(() => isReservedName("ochk", Object.create({ allowReserved: true }))).toThrow(/inherited/);
    const proto = Object.prototype as { allowReserved?: boolean };
    proto.allowReserved = true;
    try {
      expect(() => nameProblem("ochk", 80, {})).toThrow(/inherited/);
      expect(nameProblem("ochk", 80)).toBe("reserved");
      expect(isReservedName("ochk")).toBe(true);
    } finally {
      delete proto.allowReserved;
    }
  });

  // A capital reads two ways; only the starts of our names are carried forward, or the reads double per letter.
  it("reads a long name in time linear in its length", () => {
    const started = performance.now();
    expect(isReservedName("A".repeat(22) + "B".repeat(2000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("says when a name is missing or too long", () => {
    expect(nameProblem("", 80)).toBe("required");
    expect(nameProblem("x".repeat(81), 80)).toBe("too_long");
    expect(nameProblem("x".repeat(80), 80)).toBeNull();
  });

  // Code points, not UTF-16 units: 25 emoji fit under 32; a combining mark is its own.
  it("counts a name's length in code points", () => {
    for (const { name, max, problem } of vectors.lengths) {
      expect(nameProblem(name, max), `${[...name].length} code points under ${max}`).toBe(problem);
    }
  });
});
