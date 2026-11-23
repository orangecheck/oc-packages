import { describe, expect, it } from "vitest";

import { AUTH_METHODS, readSignInFacts } from "../index";

describe("readSignInFacts", () => {
  it("reads the ceremonies and the time a token states", () => {
    expect(readSignInFacts({ amr: ["bip322", "passkey"], auth_time: 1_800_000_000 })).toEqual({
      amr: ["bip322", "passkey"],
      auth_time: 1_800_000_000,
    });
  });

  it("states nothing for a token minted before the facts were written", () => {
    expect(readSignInFacts({})).toEqual({ amr: null, auth_time: null });
  });

  it.each([
    ["a method outside the list", ["bip322", "hwk"]],
    ["no method", []],
    ["a repeated method", ["bip322", "bip322"]],
    ["a string, not a list", "bip322"],
    ["a method that is not a string", ["bip322", 1]],
    ["the list's case changed", ["BIP322"]],
  ])("does not read an amr with %s", (_why, amr) => {
    expect(readSignInFacts({ amr, auth_time: 1 }).amr).toBeNull();
  });

  it.each([
    ["a fraction", 1_800_000_000.5],
    ["a string", "1800000000"],
    ["a negative number", -1],
    ["past the safe integers", 2 ** 53],
    ["not a number", Number.NaN],
  ])("does not read an auth_time that is %s", (_why, auth_time) => {
    expect(readSignInFacts({ amr: ["email"], auth_time }).auth_time).toBeNull();
  });

  it("names the five ceremonies the auth host mints", () => {
    expect(AUTH_METHODS).toEqual(["bip322", "passkey", "email", "google", "github"]);
  });
});
