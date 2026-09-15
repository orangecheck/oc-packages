/**
 * Regression tests for the signature-shape validation wrapper + the UniSat
 * no-silent-legacy-fallback change.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { getSigner } from "../sign";

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (globalThis as any).window;
  delete w.unisat;
  delete w.phantom;
  vi.restoreAllMocks();
});

describe("signature-shape validation wrapper", () => {
  function mockUnisat(returnValue: string | Promise<string>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.unisat = {
      signMessage: vi.fn(() =>
        returnValue instanceof Promise
          ? returnValue
          : Promise.resolve(returnValue),
      ),
    };
  }

  it("accepts a plausible base64 signature", async () => {
    mockUnisat("AkcwRAIgXyZabc+defGhi=");
    const sig = await getSigner("unisat", { address: "bc1q" })("msg");
    expect(sig).toBe("AkcwRAIgXyZabc+defGhi=");
  });

  it("accepts a plausible hex signature", async () => {
    mockUnisat("a1b2c3d4".repeat(16));
    await expect(
      getSigner("unisat", { address: "bc1q" })("msg"),
    ).resolves.toBeTruthy();
  });

  it("rejects an HTML error page returned instead of a signature", async () => {
    mockUnisat("<!doctype html><html><body>Something went wrong</body></html>");
    await expect(
      getSigner("unisat", { address: "bc1q" })("msg"),
    ).rejects.toThrow(/base64 or hex/i);
  });

  it("rejects the empty string", async () => {
    mockUnisat("");
    await expect(
      getSigner("unisat", { address: "bc1q" })("msg"),
    ).rejects.toThrow(/empty/i);
  });

  it("rejects an absurdly long string", async () => {
    mockUnisat("A".repeat(3000));
    await expect(
      getSigner("unisat", { address: "bc1q" })("msg"),
    ).rejects.toThrow(/length/i);
  });

  it("propagates the wallet throw instead of silently falling back to ECDSA", async () => {
    mockUnisat(Promise.reject(new Error("User rejected")));
    await expect(
      getSigner("unisat", { address: "bc1q" })("msg"),
    ).rejects.toThrow(/user rejected/i);
  });
});

describe("Phantom · the requested address is the one that must sign", () => {
  const SIG = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  function mockPhantom(
    accounts: Array<{ address: string; addressType: string }>,
  ) {
    const signMessage = vi.fn(() => Promise.resolve({ signature: SIG }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.phantom = {
      bitcoin: {
        requestAccounts: () => Promise.resolve(accounts),
        signMessage,
      },
    };
    return signMessage;
  }

  it("signs with the account whose address was asked for", async () => {
    const signMessage = mockPhantom([
      { address: "bc1qother", addressType: "p2wpkh" },
      { address: "bc1qwanted", addressType: "p2tr" },
    ]);
    await getSigner("phantom", { address: "bc1qwanted" })("msg");
    expect(signMessage).toHaveBeenCalledWith(expect.anything(), "p2tr");
  });

  it("REFUSES when the wallet has no account for that address", async () => {
    // It used to fall back to accounts[0]. The challenge message NAMES the
    // address, so a signature from another account is rejected by the
    // verifier and the user is told "invalid signature" — never the one
    // thing that would fix it. signWithOkx already refuses; this matches.
    const signMessage = mockPhantom([
      { address: "bc1qsomeoneelse", addressType: "p2wpkh" },
    ]);
    await expect(
      getSigner("phantom", { address: "bc1qwanted" })("msg"),
    ).rejects.toThrow(/no account for bc1qwanted/);
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("names the accounts it does have, so the message is actionable", async () => {
    mockPhantom([{ address: "bc1qa", addressType: "p2wpkh" }]);
    await expect(
      getSigner("phantom", { address: "bc1qz" })("msg"),
    ).rejects.toThrow(/bc1qa/);
  });

  it("still reports an empty wallet distinctly from a mismatch", async () => {
    mockPhantom([]);
    await expect(
      getSigner("phantom", { address: "bc1qz" })("msg"),
    ).rejects.toThrow(/no accounts/);
  });
});
