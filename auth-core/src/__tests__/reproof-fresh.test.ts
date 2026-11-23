import { describe, expect, it } from "vitest";

import { reproofFresh, type SessionPayload } from "../index";

const now = () => Math.floor(Date.now() / 1000);
const WINDOW = { max_age_secs: 300 };
const session = (claims: Partial<SessionPayload>): SessionPayload => ({ sub: "acct-1", did_oc: "did:oc:abc", jti: "jti-1", ...claims });

describe("reproofFresh: a passkey cannot vouch for itself", () => {
  it("does not take a step-up on a session that signed in with a passkey alone", () => {
    expect(reproofFresh(session({ amr: ["passkey"], step_up_at: now() }), WINDOW)).toBe(false);
  });

  it("takes a step-up on a session that signed in with a wallet, an email code or a provider", () => {
    for (const amr of [["bip322"], ["bip322", "passkey"], ["email"], ["google"], ["github"]]) {
      expect(reproofFresh(session({ amr, step_up_at: now() }), WINDOW)).toBe(true);
    }
  });

  it("takes a step-up on a session minted before amr was written, as before", () => {
    expect(reproofFresh(session({ step_up_at: now() }), WINDOW)).toBe(true);
  });

  it("does not take a step-up when the amr does not read", () => {
    for (const amr of [[], ["passkey", "hwk"], ["passkey", "passkey"]]) {
      expect(reproofFresh(session({ amr, step_up_at: now() }), WINDOW)).toBe(false);
    }
  });

  it("takes a fresh sudo proof whatever the session signed in with", () => {
    expect(reproofFresh(session({ amr: ["passkey"], sudo_at: now() }), WINDOW)).toBe(true);
    expect(reproofFresh(session({ amr: ["passkey"], sudo_at: now() - 301, step_up_at: now() }), WINDOW)).toBe(false);
  });

  it("takes nothing stale, and nothing without a proof", () => {
    expect(reproofFresh(session({ amr: ["bip322"], step_up_at: now() - 301 }), WINDOW)).toBe(false);
    expect(reproofFresh(session({ amr: ["bip322"] }), WINDOW)).toBe(false);
  });
});
