import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { satisfiesSignInRule, type SignInRequirement } from "../index";

// The one sign-in rule. sdk-py is held to the same file.
const V = JSON.parse(readFileSync(new URL("../../test-vectors/sign-in-rule.json", import.meta.url), "utf8")) as {
  now: number;
  cases: { name: string; token: Record<string, unknown>; requirement: SignInRequirement; meets: boolean }[];
  refused_requirements: unknown[];
};

describe("satisfiesSignInRule", () => {
  it.each(V.cases)("$name: $meets", ({ token, requirement, meets }) => {
    expect(satisfiesSignInRule(token, requirement, V.now)).toBe(meets);
  });

  it.each(V.refused_requirements)("throws on the requirement %j rather than require nothing", (requirement) => {
    expect(() => satisfiesSignInRule({ amr: ["bip322"], auth_time: V.now }, requirement as SignInRequirement, V.now)).toThrow(
      /@orangecheck\/auth-core: a sign-in requirement/,
    );
  });

  it("throws on a now that is not a number, which would meet every maxAge", () => {
    expect(() => satisfiesSignInRule({ amr: ["bip322"], auth_time: V.now - 999 }, { maxAge: 60 }, Number.NaN)).toThrow(
      /@orangecheck\/auth-core: now must be Unix seconds/,
    );
  });

  it("reads the clock when no now is given", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(satisfiesSignInRule({ amr: ["bip322"], auth_time: now - 5 }, { maxAge: 60 })).toBe(true);
    expect(satisfiesSignInRule({ amr: ["bip322"], auth_time: now - 3600 }, { maxAge: 60 })).toBe(false);
  });
});
