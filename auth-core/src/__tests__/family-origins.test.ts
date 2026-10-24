import { afterEach, describe, expect, it, vi } from "vitest";

import { FAMILY_ORIGINS, isFamilyOrigin } from "../family-origins";
import * as root from "../index";

describe("the family origins", () => {
  it("are the seventeen family sites", () => {
    expect([...FAMILY_ORIGINS].sort()).toEqual(
      [
        "https://ochk.io",
        "https://me.ochk.io",
        "https://attest.ochk.io",
        "https://lock.ochk.io",
        "https://vote.ochk.io",
        "https://stamp.ochk.io",
        "https://agent.ochk.io",
        "https://pledge.ochk.io",
        "https://vault.ochk.io",
        "https://chat.ochk.io",
        "https://cosign.ochk.io",
        "https://me-demo.ochk.io",
        "https://globe.ochk.io",
        "https://btc.ochk.io",
        "https://analytics.ochk.io",
        "https://bot.ochk.io",
        "https://forge.ochk.io",
      ].sort(),
    );
    for (const o of FAMILY_ORIGINS) expect(isFamilyOrigin(o, false), o).toBe(true);
  });

  it("refuse every other name, including ones under .ochk.io", () => {
    for (const o of [
      "https://btcpay.ochk.io",
      "https://relay.ochk.io",
      "https://docs.ochk.io",
      "https://fleet.ochk.io",
      "https://ochk.app",
      "http://ochk.io",
      "https://ochk.io/",
      "https://ochk.io:8443",
      "https://evilochk.io",
      "https://ochk.io.evil.example",
      "https://VAULT.ochk.io",
      "null",
      "",
    ]) {
      expect(isFamilyOrigin(o, false), o).toBe(false);
    }
    expect(isFamilyOrigin(undefined, false)).toBe(false);
  });

  it("let localhost in only while developing", () => {
    expect(isFamilyOrigin("http://localhost:3000", true)).toBe(true);
    expect(isFamilyOrigin("http://127.0.0.1:5173", true)).toBe(true);
    expect(isFamilyOrigin("http://localhost:3000", false)).toBe(false);
    expect(isFamilyOrigin("http://localhost.evil.example", true)).toBe(false);
  });

  describe("by default", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("let localhost in only in an explicit development or test run", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isFamilyOrigin("http://localhost:3000")).toBe(false);
      vi.stubEnv("NODE_ENV", "");
      expect(isFamilyOrigin("http://localhost:3000")).toBe(false);
      vi.stubEnv("NODE_ENV", "development");
      expect(isFamilyOrigin("http://localhost:3000")).toBe(true);
      vi.stubEnv("NODE_ENV", "test");
      expect(isFamilyOrigin("http://localhost:3000")).toBe(true);
    });

    it("keep localhost out with NODE_ENV unset", () => {
      vi.stubEnv("NODE_ENV", undefined);
      expect(process.env.NODE_ENV).toBeUndefined();
      expect(isFamilyOrigin("http://localhost:3000")).toBe(false);
    });
  });

  it("decide from their own list, not from the Set a caller can add to", () => {
    const set = FAMILY_ORIGINS as Set<string>;
    set.add("https://btcpay.ochk.io");
    try {
      expect(isFamilyOrigin("https://btcpay.ochk.io", false)).toBe(false);
    } finally {
      set.delete("https://btcpay.ochk.io");
    }
  });

  it("are the same from the package root", () => {
    expect(root.FAMILY_ORIGINS).toBe(FAMILY_ORIGINS);
    expect(root.isFamilyOrigin).toBe(isFamilyOrigin);
  });
});
