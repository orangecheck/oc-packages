import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  // The /display-name entry ships to browsers. As built, it must load, as ESM and as CJS,
  // in a separate Node process with no other module beside it: any import it gains fails here.
  it("loads as built with nothing else installed", () => {
    const dist = new URL("../../dist/", import.meta.url);
    for (const f of ["display-name.mjs", "display-name.js"]) {
      expect(existsSync(new URL(f, dist)), `dist/${f} is missing: run yarn build first`).toBe(true);
    }
    // A node: built-in would load in the probe below but break a browser bundle, so the built
    // files may not import, require or re-export anything at all.
    for (const f of ["display-name.mjs", "display-name.js"]) {
      const built = readFileSync(new URL(f, dist), "utf8");
      expect(built, f).not.toMatch(/\bimport\b|\brequire\s*\(|\bfrom\s*["']/);
    }
    const dir = mkdtempSync(join(tmpdir(), "display-name-"));
    try {
      copyFileSync(new URL("display-name.mjs", dist), join(dir, "display-name.mjs"));
      copyFileSync(new URL("display-name.js", dist), join(dir, "display-name.cjs"));
      writeFileSync(
        join(dir, "probe.mjs"),
        [
          'import { createRequire } from "node:module";',
          'const esm = await import("./display-name.mjs");',
          'const cjs = createRequire(import.meta.url)("./display-name.cjs");',
          'const names = ["och\\ufe0fk", "Lumen\\u00adNotes", "Lumen Notes"];',
          "console.log(JSON.stringify([esm, cjs].map((m) => names.map((n) => m.nameProblem(n, 80)))));",
        ].join("\n"),
      );
      const out = execFileSync(process.execPath, ["probe.mjs"], { cwd: dir, encoding: "utf8" });
      const answer = ["reserved", "hidden_characters", null];
      expect(JSON.parse(out)).toEqual([answer, answer]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says when a name is missing or too long", () => {
    expect(nameProblem("", 80)).toBe("required");
    expect(nameProblem("x".repeat(81), 80)).toBe("too_long");
    expect(nameProblem("x".repeat(80), 80)).toBeNull();
  });
});
