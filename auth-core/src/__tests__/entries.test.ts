import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The entries a browser bundle may take. Each, as built, must import, require
// and re-export nothing (a node: built-in would load in Node but break a browser
// bundle), and must load as ESM and as CJS in a separate Node process with no
// other module beside it. `probe` is run against each copy; `answer` is what it gives.
const ENTRIES = [
  {
    name: "display-name",
    probe: 'const names = ["och\\ufe0fk", "Lumen\\u00adNotes", "Lumen Notes", "0chk"]; return names.map((n) => m.nameProblem(n, 80));',
    answer: ["reserved", "hidden_characters", null, "reserved"],
  },
  {
    name: "family-origins",
    probe:
      'return ["https://vault.ochk.io", "https://btcpay.ochk.io", "http://localhost:3000"].map((o) => m.isFamilyOrigin(o, false)).concat(m.isFamilyOrigin("http://localhost:3000"), m.FAMILY_ORIGINS.size);',
    answer: [true, false, false, false, 17],
  },
  {
    name: "identifiers",
    probe:
      'const did = "did:oc:" + "a".repeat(32); return [m.isDidOc(did), m.isDidOc(did + "\\n"), m.isDidOc(did.toUpperCase()), m.normalizeEmail(" Ann@Example.COM\\t")];',
    answer: [true, false, false, "ann@example.com"],
  },
];

describe.each(ENTRIES)("the $name entry, as built", ({ name, probe, answer }) => {
  const dist = new URL("../../dist/", import.meta.url);
  const files = [`${name}.mjs`, `${name}.js`];

  it("is built", () => {
    for (const f of files) {
      expect(existsSync(new URL(f, dist)), `dist/${f} is missing: run yarn build first`).toBe(true);
    }
  });

  it("imports, requires and re-exports nothing", () => {
    for (const f of files) {
      expect(readFileSync(new URL(f, dist), "utf8"), f).not.toMatch(/\bimport\b|\brequire\s*\(|\bfrom\s*["']/);
    }
  });

  it("loads with nothing else installed", () => {
    const dir = mkdtempSync(join(tmpdir(), `${name}-`));
    try {
      copyFileSync(new URL(`${name}.mjs`, dist), join(dir, `${name}.mjs`));
      copyFileSync(new URL(`${name}.js`, dist), join(dir, `${name}.cjs`));
      writeFileSync(
        join(dir, "probe.mjs"),
        [
          'import { createRequire } from "node:module";',
          `const esm = await import("./${name}.mjs");`,
          `const cjs = createRequire(import.meta.url)("./${name}.cjs");`,
          `const run = (m) => { ${probe} };`,
          "console.log(JSON.stringify([run(esm), run(cjs)]));",
        ].join("\n"),
      );
      // A production process: the default for localhost must be closed there.
      const env = { ...process.env, NODE_ENV: "production" };
      const out = execFileSync(process.execPath, ["probe.mjs"], { cwd: dir, encoding: "utf8", env });
      expect(JSON.parse(out)).toEqual([answer, answer]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
