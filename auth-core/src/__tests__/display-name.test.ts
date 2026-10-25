import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HIDDEN_TEXT_CHARS, isReservedName, nameProblem } from "../index";
import vectors from "./display-name.vectors.json";

describe("the family name rule", () => {
  it("refuses orangecheck's own names, whatever their case, width, spacing or variation selectors", () => {
    for (const name of vectors.reserved) {
      expect(isReservedName(name), JSON.stringify(name)).toBe(true);
      expect(nameProblem(name, 80), JSON.stringify(name)).toBe("reserved");
    }
  });

  it("allows a name that only contains or resembles one of them", () => {
    for (const name of vectors.allowed) {
      expect(nameProblem(name, 80), JSON.stringify(name)).toBeNull();
    }
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
