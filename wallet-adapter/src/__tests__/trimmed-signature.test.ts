// @vitest-environment node
/**
 * Sparrow, Electrum's GUI, Nunchuk on Android and Bitcoin Keeper trim the text before they sign
 * it, which drops a message's final LF. The verifiers of an auth challenge, an attestation, a
 * bond and an OC Lock device bind or revocation take a signature made that way, so a pasted one
 * over those without their final LF passes here too. Any other message signed that way is
 * refused as trimmed, with words saying so, and every other edit of a message is still a
 * signature by no one asked.
 */

import { describe, expect, it } from "vitest";
import { addressFromPrivateKey, signMessage } from "@orangecheck/bip322";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window ??= {};

import { TrimmedSignatureError, walletFailure, walletFailureText } from "../failure";
import { assertSignedBy, getSigner, WrongAccountError } from "../sign";

const key = new Uint8Array(32).fill(5);
const address = addressFromPrivateKey(key, "p2wpkh");
const CHALLENGE =
  [
    "orangecheck-auth",
    `address: ${address}`,
    `nonce: ${"d".repeat(32)}`,
    "issued_at: 2026-11-21T05:00:00Z",
    "expires_at: 2026-11-21T05:05:00Z",
    "ack: I authorize this session under the OrangeCheck auth challenge.",
    `audience: did:oc:${"e".repeat(32)}`,
    "purpose: sudo",
  ].join("\n") + "\n";
const ATTESTATION = `orangecheck\nidentities: github:alice\naddress: ${address}\n`;
const BOND = `orangecheck-bond\naddress: ${address}\nack: x\n`;
const DEVICE = `address: ${address}\ndevice_id: ${"f".repeat(32)}\n`;
const TAKEN = [
  ["an auth challenge", CHALLENGE],
  ["an attestation", ATTESTATION],
  ["a bond", BOND],
  ["a v2 device bind", `oc-lock:device-bind:v2\n${DEVICE}`],
  ["a v3 device bind", `oc-lock:device-bind:v3\n${DEVICE}`],
  ["a device revocation", `oc-lock:device-revoke:v2\n${DEVICE}`],
] as const;
const NOT_TAKEN = [
  "hello\n",
  `oc-lock:device-bind:v4\n${DEVICE}`,
  `orangecheck-authz\naddress: ${address}\n`,
  " " + CHALLENGE,
  "x" + ATTESTATION,
];

const pasted = (message: string, signed: string) =>
  assertSignedBy({ address, message, signature: signMessage(address, signed, key) });

describe("a pasted signature from a wallet that trims", () => {
  it.each(TAKEN)("passes for %s signed without its final LF", async (_, message) => {
    await expect(pasted(message, message.slice(0, -1))).resolves.toBeUndefined();
    await expect(pasted(message, message)).resolves.toBeUndefined();
  });

  it("passes through the manual signer as well", async () => {
    const sig = signMessage(address, CHALLENGE.trim(), key);
    await expect(
      getSigner("manual", { address, onManualSign: async () => sig })(CHALLENGE),
    ).resolves.toBe(sig);
  });

  it("is refused as trimmed for any other message ending in a line break", async () => {
    for (const message of NOT_TAKEN) {
      await expect(pasted(message, message.slice(0, -1))).rejects.toBeInstanceOf(
        TrimmedSignatureError,
      );
      await expect(pasted(message, message.trim())).rejects.toBeInstanceOf(
        TrimmedSignatureError,
      );
    }
  });

  it.each(TAKEN)("is refused as trimmed for %s whose trim took more than the final LF", async (_, message) => {
    const spaced = `${message.slice(0, -1)} \n`;
    await expect(pasted(spaced, spaced.trim())).rejects.toBeInstanceOf(TrimmedSignatureError);
  });

  it.each(TAKEN)("is still a wrong account for any other edit of %s", async (_, message) => {
    for (const signed of [
      message + "\n",
      " " + message,
      message.replace(/\n/g, "\r\n"),
      message.slice(0, -2),
      message.slice(0, -1) + " ",
    ]) {
      await expect(pasted(message, signed)).rejects.toBeInstanceOf(WrongAccountError);
    }
  });

  it("names the cause in plain words", () => {
    const err = new TrimmedSignatureError();
    expect(walletFailure(err)).toBe("trimmed");
    expect(walletFailure({ code: "E_TRIMMED_SIGNATURE" })).toBe("trimmed");
    expect(walletFailureText(err)).toMatch(/last line break/);
    expect(walletFailureText(err, { paste: true })).toMatch(/paste a signature/);
  });
});
