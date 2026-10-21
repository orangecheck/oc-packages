// @vitest-environment node
/**
 * A wallet's own failure reaches a person as one sentence per cause, whatever
 * the wallet threw: an Error, a JSON-RPC object, or a bare { code: 4001 }.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window ??= {};

import {
  toWalletError,
  WalletNotFoundError,
  WalletRejectedError,
  walletFailure,
  walletFailureText,
} from "../failure";
import { getSigner, WrongAccountError } from "../sign";

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (globalThis as any).window;
  delete w.unisat;
  delete w.XverseProviders;
  delete w.LeatherProvider;
  vi.restoreAllMocks();
});

const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";

describe("walletFailure", () => {
  it.each([
    ["UniSat's bare object", { code: 4001, message: "User rejected the request." }, "rejected"],
    ["Leather's JSON-RPC error", { jsonrpc: "2.0", error: { code: 4001, message: "User rejected request" } }, "rejected"],
    ["Xverse's code", Object.assign(new Error("Xverse signMessage failed: error"), { code: -32000 }), "rejected"],
    ["a cancelled paste", new Error("Manual signing cancelled"), "rejected"],
    ["a wrong account", new WrongAccountError(ADDRESS, "bc1qother"), "wrong-account"],
    ["a signature by no one asked", new WrongAccountError(ADDRESS), "wrong-account"],
    ["Phantom without the account", Object.assign(new Error("Phantom has no account"), { code: "E_WRONG_ACCOUNT" }), "wrong-account"],
    ["a missing wallet", new WalletNotFoundError("UniSat wallet not found on window.unisat"), "not-found"],
    ["a timeout", Object.assign(new Error("signal timed out"), { name: "TimeoutError" }), "timed-out"],
    ["a wallet's own timeout text", new Error("Request timed out"), "timed-out"],
    ["anything else", new Error("boom"), "other"],
    ["not an error at all", undefined, "other"],
  ])("%s", (_label, err, kind) => {
    expect(walletFailure(err)).toBe(kind);
  });
});

describe("walletFailureText", () => {
  it("gives one sentence per cause, with a paste variant where a page offers one", () => {
    expect(walletFailureText({ code: 4001 })).toBe(
      "The request was declined in your wallet. Sign again when you are ready.",
    );
    expect(walletFailureText({ code: 4001 }, { paste: true })).toBe(
      "The request was declined in your wallet. Sign again, or paste a signature.",
    );
    expect(walletFailureText(new WrongAccountError(ADDRESS, "bc1qother"))).toBe(
      "That signature is not from the address shown. Switch your wallet to that address, then sign again.",
    );
    expect(walletFailureText(new WalletNotFoundError("x"))).toBe(
      "That wallet is not in this browser. Install it, or choose another wallet.",
    );
    expect(walletFailureText(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(
      "Your wallet did not answer. Open it to finish the request, then try again.",
    );
    expect(walletFailureText(new Error("boom"), { paste: true })).toBe(
      "Your wallet did not sign. Try again, or paste a signature.",
    );
  });

  it("never repeats what the wallet said", () => {
    const said = "User rejected the request. Internal code 4001 at injected.js:12";
    expect(walletFailureText(new Error(said))).not.toContain("injected");
  });
});

describe("getSigner", () => {
  it("turns a bare { code: 4001 } from the wallet into a WalletRejectedError", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.unisat = {
      getAccounts: () => Promise.resolve([ADDRESS]),
      signMessage: () => Promise.reject({ code: 4001, message: "User rejected the request." }),
    };
    const err = await getSigner("unisat", { address: ADDRESS })("msg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletRejectedError);
    expect((err as WalletRejectedError).code).toBe("E_USER_REJECTED");
    expect((err as WalletRejectedError).cause).toEqual({ code: 4001, message: "User rejected the request." });
  });

  it("keeps Xverse's decline code", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.XverseProviders = {
      BitcoinProvider: {
        request: () => Promise.resolve({ status: "error", error: { code: -32000, message: "User rejected" } }),
      },
    };
    const err = await getSigner("xverse", { address: ADDRESS })("msg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletRejectedError);
  });

  it("says a wallet that is not there is not found", async () => {
    const err = await getSigner("unisat", { address: ADDRESS })("msg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletNotFoundError);
    expect(walletFailure(err)).toBe("not-found");
  });

  it("still refuses a wrong account as WrongAccountError", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.unisat = {
      getAccounts: () => Promise.resolve(["bc1qother"]),
      signMessage: vi.fn(),
    };
    const err = await getSigner("unisat", { address: ADDRESS })("msg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WrongAccountError);
    expect(walletFailure(err)).toBe("wrong-account");
  });
});

describe("toWalletError", () => {
  it("always gives an Error, keeping the wallet's code", () => {
    const e = toWalletError({ code: 4100, message: "Not authorized" });
    expect(e).toBeInstanceOf(Error);
    expect((e as Error & { code?: unknown }).code).toBe(4100);
    expect(e.message).toBe("Not authorized");
  });

  it("passes an Error that is not a decline through untouched", () => {
    const original = new WrongAccountError(ADDRESS);
    expect(toWalletError(original)).toBe(original);
  });
});
