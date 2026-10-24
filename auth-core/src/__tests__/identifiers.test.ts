import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isDidOc, normalizeEmail } from "../identifiers";
import * as root from "../index";

// Shared with sdk-py's tests/test_identifiers.py.
const V = JSON.parse(readFileSync(new URL("../../test-vectors/identifiers.json", import.meta.url), "utf8")) as {
  did_oc: { valid: string[]; invalid: string[] };
  email: Array<{ in: string; out: string }>;
};

describe("isDidOc", () => {
  it.each(V.did_oc.valid)("accepts %j", (did) => {
    expect(isDidOc(did)).toBe(true);
  });

  it.each(V.did_oc.invalid)("refuses %j", (value) => {
    expect(isDidOc(value)).toBe(false);
  });

  it("refuses anything that is not a string, even one that prints as a did", () => {
    const did = V.did_oc.valid[0]!;
    for (const value of [undefined, null, 42, [did], { toString: () => did }, new String(did)]) {
      expect(isDidOc(value)).toBe(false);
    }
  });
});

describe("normalizeEmail", () => {
  it.each(V.email.map((e) => [JSON.stringify(e.in), e.in, e.out]))("normalizes %s", (_, input, out) => {
    expect(normalizeEmail(input)).toBe(out);
  });

  it("answers the same twice over", () => {
    for (const e of V.email) expect(normalizeEmail(normalizeEmail(e.in))).toBe(e.out);
  });
});

describe("the package root", () => {
  it("exports the same functions", () => {
    expect(root.isDidOc).toBe(isDidOc);
    expect(root.normalizeEmail).toBe(normalizeEmail);
  });
});
