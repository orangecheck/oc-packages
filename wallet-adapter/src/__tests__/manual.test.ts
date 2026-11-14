// @vitest-environment node
/**
 * The `manual` adapter collects a pasted signature through the caller's
 * onManualSign; window.prompt is only a deprecated fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressFromPrivateKey, signMessage } from "@orangecheck/bip322";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window ??= {};

import {
  _resetManualPromptWarningForTests,
  getSigner,
  ManualSignUnavailable,
} from "../sign";

const key = new Uint8Array(32).fill(3);
const address = addressFromPrivateKey(key, "p2wpkh");
const MESSAGE = "orangecheck test\nline two";
const SIG = signMessage(address, MESSAGE, key);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => (globalThis as any).window;

beforeEach(() => _resetManualPromptWarningForTests());
afterEach(() => {
  delete win().prompt;
  vi.restoreAllMocks();
});

describe("manual signing with onManualSign", () => {
  it("hands the exact message to the caller and returns the trimmed paste", async () => {
    const prompt = vi.fn();
    win().prompt = prompt;
    const onManualSign = vi.fn(async () => `  ${SIG}\n`);
    const sig = await getSigner("manual", { address, onManualSign })(MESSAGE);
    expect(sig).toBe(SIG);
    expect(onManualSign).toHaveBeenCalledWith(MESSAGE);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("an empty paste is a cancel, not a signature", async () => {
    await expect(
      getSigner("manual", { address, onManualSign: async () => "  " })(MESSAGE),
    ).rejects.toThrow(/cancelled/);
  });

  it("still refuses a paste that does not verify for the address", async () => {
    const other = new Uint8Array(32).fill(4);
    const otherAddr = addressFromPrivateKey(other, "p2wpkh");
    const foreign = signMessage(otherAddr, MESSAGE, other);
    await expect(
      getSigner("manual", { address, onManualSign: async () => foreign })(
        MESSAGE,
      ),
    ).rejects.toThrow(/switch the wallet/);
  });
});

describe("deprecated window.prompt fallback", () => {
  it("still works without onManualSign, and warns once", async () => {
    win().prompt = vi.fn(() => SIG);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sign = getSigner("manual", { address });
    await expect(sign(MESSAGE)).resolves.toBe(SIG);
    await expect(sign(MESSAGE)).resolves.toBe(SIG);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/onManualSign/);
  });

  it("with no handler and no prompt to fall back on, throws a typed error", async () => {
    await expect(getSigner("manual", { address })(MESSAGE)).rejects.toBeInstanceOf(
      ManualSignUnavailable,
    );
  });
});
