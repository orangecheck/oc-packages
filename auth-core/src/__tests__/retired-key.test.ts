import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { retiredKeyVouches, TOKEN_MAX_LIFETIME_SEC } from "../index";

// Shared with sdk-py's tests/test_retired_key.py.
type Case = { name: string; iat?: unknown; exp?: unknown; vouches: boolean };
const V = JSON.parse(readFileSync(new URL("../../test-vectors/retired-key.json", import.meta.url), "utf8")) as {
  retired_at: number;
  max_lifetime_sec: number;
  cases: Case[];
};

const special = (v: unknown) =>
  v !== null && typeof v === "object" && "$number" in v ? Number((v as { $number: string }).$number) : v;

describe("a retired key's tokens (test-vectors/retired-key.json)", () => {
  it("bounds a token's life at the longest ochk.io signs", () => {
    expect(TOKEN_MAX_LIFETIME_SEC).toBe(V.max_lifetime_sec);
  });

  it.each(V.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const claims: { iat?: unknown; exp?: unknown } = {};
    if ("iat" in c) claims.iat = special(c.iat);
    if ("exp" in c) claims.exp = special(c.exp);
    expect(retiredKeyVouches(claims, V.retired_at)).toBe(c.vouches);
  });

  it("vouches for nothing when the retirement time is unreadable (0)", () => {
    expect(retiredKeyVouches({ iat: 1, exp: 2 }, 0)).toBe(false);
  });
});
