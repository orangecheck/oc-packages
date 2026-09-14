import { describe, expect, it } from "vitest";

import {
  handleSudoRequired,
  isSudoAccountMismatch,
  SUDO_ACCOUNT_MISMATCH_MESSAGE,
} from "./sudo";

/**
 * The two sudo outcomes must stay distinguishable at the call site. They look
 * alike — both are a 401 carrying a reason — but only one is fixable by running
 * the ceremony. Treating the mismatch as `sudo_required` bounces the user to
 * /sudo, which re-proves the wrong account, and does it again on return: a loop.
 *
 * These run without a DOM on purpose. `redirectToSudo` refuses to run outside a
 * browser, so "did it take the redirect path" is observable as that refusal —
 * which is exactly the branch under test, and needs no navigation stub.
 */

function tookRedirectPath(body: { reason?: string } | null): boolean {
  try {
    handleSudoRequired(body, { purpose: "link an email" });
    return false;
  } catch (err) {
    return String(err).includes("requires a browser environment");
  }
}

describe("sudo response handling", () => {
  it("sends sudo_required down the redirect path", () => {
    expect(tookRedirectPath({ reason: "sudo_required" })).toBe(true);
  });

  it("does NOT send sudo_account_mismatch down the redirect path", () => {
    expect(tookRedirectPath({ reason: "sudo_account_mismatch" })).toBe(false);
    expect(handleSudoRequired({ reason: "sudo_account_mismatch" })).toBe(false);
    expect(isSudoAccountMismatch({ reason: "sudo_account_mismatch" })).toBe(
      true,
    );
  });

  it("leaves every other reason to the caller", () => {
    for (const reason of ["address_linked_elsewhere", "invalid_body"]) {
      expect(tookRedirectPath({ reason })).toBe(false);
      expect(handleSudoRequired({ reason })).toBe(false);
      expect(isSudoAccountMismatch({ reason })).toBe(false);
    }
    expect(handleSudoRequired(null)).toBe(false);
    expect(isSudoAccountMismatch(null)).toBe(false);
    expect(handleSudoRequired({})).toBe(false);
  });

  it("offers a message that tells the user what to actually do", () => {
    expect(SUDO_ACCOUNT_MISMATCH_MESSAGE).toMatch(/switch/i);
  });
});
