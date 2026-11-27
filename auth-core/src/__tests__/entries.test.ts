import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The entries a browser bundle may take. Each, as built, must import, require
// and re-export nothing (a node: built-in would load in Node but break a browser
// bundle), and must load as ESM and as CJS in a separate Node process with no
// other module beside it. `probe` is run against each copy; `answer` is what it gives.
const ENTRIES = [
  {
    name: "display-name",
    probe:
      'const names = ["och\\ufe0fk", "Lumen\\u00adNotes", "Lumen Notes", "0chk"]; return names.map((n) => m.nameProblem(n, 80)).concat(m.freeTextProblem("Orange Check", 80), m.freeTextProblem("Earn sats with OrangeCheck", 80));',
    answer: ["reserved", "hidden_characters", null, "reserved", "reserved", null],
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
  {
    name: "issuer-origin",
    probe: 'return ["http://[::1]:3000", "https://ochk.io/api", "HTTPS://OCHK.IO/"].map((o) => m.parseIssuerOrigin(o)).concat(m.ISSUER_ORIGIN_RULE);',
    answer: ["http://[::1]:3000", null, "https://ochk.io", "one origin with no path: https, or http on localhost, 127.0.0.1 or [::1]"],
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

// Both relay-assertion builds load here, at collection, which has no timeout: a first import took seconds on a busy box.
const RELAY = ["relay-assertion.mjs", "relay-assertion.js"].map((f) => new URL(f, new URL("../../dist/", import.meta.url)));
const relayBuilt = RELAY.every((u) => existsSync(u));
const relayEsm = relayBuilt ? await import(RELAY[0]!.href) : undefined;
const relayCjs = relayBuilt ? createRequire(import.meta.url)(fileURLToPath(RELAY[1]!)) : undefined;

// stamp-core reaches only the server entry that hashes relay bodies; the main and browser entries never load it.
describe("stamp-core, as built", () => {
  const dist = new URL("../../dist/", import.meta.url);
  const read = (f: string) => readFileSync(new URL(f, dist), "utf8");

  it("is named by no other entry", () => {
    for (const name of ["index", ...ENTRIES.map((e) => e.name)]) {
      for (const ext of ["mjs", "js", "d.ts", "d.mts"]) {
        expect(read(`${name}.${ext}`), `${name}.${ext}`).not.toContain("stamp-core");
      }
    }
  });

  it("is imported by relay-assertion, not copied into it", () => {
    expect(read("relay-assertion.mjs")).toMatch(/from ["']@orangecheck\/stamp-core\/canonical["']/);
    expect(read("relay-assertion.js")).toMatch(/require\(["']@orangecheck\/stamp-core\/canonical["']\)/);
    for (const f of ["relay-assertion.mjs", "relay-assertion.js"]) {
      expect(read(f), f).not.toMatch(/function encodeString|function canonicalize/);
    }
  });

  it("signs in one format and verifies in the other", async () => {
    expect(relayBuilt, "dist/relay-assertion.mjs or .js is missing: run yarn build first").toBe(true);
    const [esm, cjs] = [relayEsm, relayCjs];
    expect(esm, "the two builds loaded as one").not.toBe(cjs);
    for (const m of [esm, cjs]) {
      expect(typeof m.signRelayAssertion).toBe("function");
      expect(typeof m.verifyRelayAssertion).toBe("function");
    }
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const request = { method: "POST", path: "/api/x?y=1" };
    for (const [signer, verifier] of [
      [esm, cjs],
      [cjs, esm],
    ]) {
      const token = await signer.signRelayAssertion({
        privateJwk: b64(privateKey.export({ format: "jwk" })),
        kid: "k",
        audience: "https://me.ochk.io",
        actor: "did:oc:x",
        sudoAt: Math.floor(Date.now() / 1000),
        request: { ...request, wireBody: '{"b":1, "a":2}' },
      });
      const result = await verifier.verifyRelayAssertion({
        token,
        publicJwks: b64({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k" }] }),
        audience: "https://me.ochk.io",
        actor: "did:oc:x",
        request: { ...request, body: { a: 2, b: 1 } },
        maxSudoAgeSeconds: 300,
        claimJti: async () => true,
      });
      expect(result.ok).toBe(true);
    }
  });
});
