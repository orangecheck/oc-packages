import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bondMeets, readBondNeed, type SessionPayload } from "../index";

// Shared with me-client's src/__tests__/bond-need.test.ts and sdk-py's tests/test_bond_need.py.
type Case = { need: Record<string, unknown>; valid: boolean; meets: boolean };
const V = JSON.parse(readFileSync(new URL("../../test-vectors/bond-need.json", import.meta.url), "utf8")) as {
  claim: { sats_floor: number; days_floor: number; checked_ago_secs: number };
  cases: Case[];
};

const CAMEL: Record<string, string> = { min_sats: "minSats", min_days: "minDays", max_age_secs: "maxAgeSecs" };
const special = (v: unknown) =>
  v !== null && typeof v === "object" && "$number" in v ? Number((v as { $number: string }).$number) : v;
const need = (c: Case) =>
  Object.fromEntries(Object.entries(c.need).map(([k, v]) => [CAMEL[k] ?? k, special(v)]));

const session = {
  sub: "acct",
  did_oc: "did:oc:x",
  jti: "j",
  oc_bond: {
    v: 1,
    sats_floor: V.claim.sats_floor,
    days_floor: V.claim.days_floor,
    height: 971_800,
    checked_at: Math.floor(Date.now() / 1000) - V.claim.checked_ago_secs,
    nullifier: "ab".repeat(32),
  },
} as SessionPayload;

describe("bond floors (test-vectors/bond-need.json)", () => {
  it.each(V.cases.map((c) => [JSON.stringify(c.need), c] as const))("%s", (_name, c) => {
    expect(readBondNeed(need(c)) !== null).toBe(c.valid);
    expect(bondMeets(session, need(c))).toBe(c.meets);
  });

  it("reads a key left undefined as left out, and refuses a floor that is not an object", () => {
    expect(readBondNeed({ minSats: undefined })).toEqual({ minSats: undefined });
    expect(bondMeets(session, { minSats: undefined, minDays: 30 })).toBe(true);
    for (const bad of [null, undefined, 5, "minSats", [10000]]) {
      expect(readBondNeed(bad)).toBeNull();
      expect(bondMeets(session, bad as never)).toBe(false);
    }
  });
});
