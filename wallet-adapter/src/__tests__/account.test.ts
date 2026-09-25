// @vitest-environment node
/**
 * UniSat and Leather sign with the wallet's active account and ignore the
 * requested address. A signature from another account names the wrong key
 * and every verifier rejects it, so getSigner must refuse it rather than
 * hand it to the caller to publish. Real keys, real BIP-322.
 */

import * as ecc from "@bitcoinerlab/secp256k1";
import { Address, Signer } from "bip322-js";
import { ECPairFactory } from "ecpair";
import { afterEach, describe, expect, it, vi } from "vitest";

// bitcoinjs-lib's ecc self-check fails under jsdom's Uint8Array, so these run
// in node with a bare `window` object for the wallet globals.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window ??= {};

import { assertSignedBy, getSigner, verifyBip322, WrongAccountError } from "../sign";

const ECPair = ECPairFactory(ecc);

function key(seed: number, type: "p2tr" | "p2wpkh" | "p2pkh") {
  const pair = ECPair.fromPrivateKey(Buffer.alloc(32, seed));
  return {
    address: Address.convertPubKeyIntoAddress(pair.publicKey, type).mainnet,
    wif: pair.toWIF(),
  };
}

const PRINCIPAL = key(7, "p2tr");
const OTHER = key(9, "p2tr");
const PRINCIPAL_SEGWIT = key(7, "p2wpkh");
const PRINCIPAL_LEGACY = key(7, "p2pkh");
const MESSAGE = "67ea21d93ea2cc2d4ac4aa3527f3a9ff082246c7d81b2f4ead070b893e05e25e";

function sign(k: { address: string; wif: string }, m: string): string {
  const sig = Signer.sign(k.wif, k.address, m);
  return typeof sig === "string" ? sig : Buffer.from(sig).toString("base64");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => (globalThis as any).window;

afterEach(() => {
  delete win().unisat;
  delete win().LeatherProvider;
  vi.restoreAllMocks();
});

function mockUnisat(active: { address: string; wif: string }, withAccounts = true) {
  const signMessage = vi.fn(async (m: string) => sign(active, m));
  win().unisat = {
    signMessage,
    ...(withAccounts ? { getAccounts: async () => [active.address] } : {}),
  };
  return signMessage;
}

function mockLeather(
  active: { address: string; wif: string },
  opts: { reportsAddresses?: boolean; addresses?: string[] } = {},
) {
  const signMessage = vi.fn(async (m: string) => sign(active, m));
  win().LeatherProvider = {
    request: async (method: string, params?: { message: string }) => {
      if (method === "getAddresses") {
        if (opts.reportsAddresses === false) throw new Error("unsupported");
        return {
          result: {
            addresses: (opts.addresses ?? [active.address]).map((address) => ({ address })),
          },
        };
      }
      if (method === "signMessage") {
        return { result: { signature: await signMessage(params!.message) } };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return signMessage;
}

describe("UniSat", () => {
  it("returns a signature that verifies for the requested address", async () => {
    mockUnisat(PRINCIPAL);
    const sig = await getSigner("unisat", { address: PRINCIPAL.address })(MESSAGE);
    await expect(assertSignedBy({ address: PRINCIPAL.address, message: MESSAGE, signature: sig })).resolves.toBeUndefined();
  });

  it("refuses before signing when the active account is another address", async () => {
    const signMessage = mockUnisat(OTHER);
    const err = await getSigner("unisat", { address: PRINCIPAL.address })(MESSAGE).catch((e) => e);
    expect(err).toBeInstanceOf(WrongAccountError);
    expect(err.code).toBe("E_WRONG_ACCOUNT");
    expect(err.activeAddress).toBe(OTHER.address);
    expect(err.message).toBe(
      `wallet signed with ${OTHER.address}, switch to ${PRINCIPAL.address} and sign again`,
    );
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("refuses the signature when the wallet cannot report its account", async () => {
    mockUnisat(OTHER, false);
    await expect(
      getSigner("unisat", { address: PRINCIPAL.address })(MESSAGE),
    ).rejects.toBeInstanceOf(WrongAccountError);
  });
});

describe("Leather", () => {
  it("returns a signature that verifies for the requested address", async () => {
    mockLeather(PRINCIPAL, { addresses: [PRINCIPAL_SEGWIT.address, PRINCIPAL.address] });
    const sig = await getSigner("leather", { address: PRINCIPAL.address })(MESSAGE);
    await expect(assertSignedBy({ address: PRINCIPAL.address, message: MESSAGE, signature: sig })).resolves.toBeUndefined();
  });

  it("refuses before signing when the active account does not hold the address", async () => {
    const signMessage = mockLeather(OTHER);
    const err = await getSigner("leather", { address: PRINCIPAL.address })(MESSAGE).catch((e) => e);
    expect(err).toBeInstanceOf(WrongAccountError);
    expect(err.activeAddress).toBe(OTHER.address);
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("refuses the signature when the wallet cannot report its addresses", async () => {
    mockLeather(OTHER, { reportsAddresses: false });
    await expect(
      getSigner("leather", { address: PRINCIPAL.address })(MESSAGE),
    ).rejects.toBeInstanceOf(WrongAccountError);
  });
});

describe("assertSignedBy", () => {
  it("accepts the same signature hex-encoded", async () => {
    const hex = Buffer.from(sign(PRINCIPAL, MESSAGE), "base64").toString("hex");
    await expect(assertSignedBy({ address: PRINCIPAL.address, message: MESSAGE, signature: hex })).resolves.toBeUndefined();
  });

  it("refuses a valid signature for a different message", async () => {
    await expect(
      assertSignedBy({
        address: PRINCIPAL.address,
        message: MESSAGE,
        signature: sign(PRINCIPAL, "other"),
      }),
    ).rejects.toBeInstanceOf(WrongAccountError);
  });

  it("accepts a p2wpkh signature", async () => {
    await expect(
      assertSignedBy({
        address: PRINCIPAL_SEGWIT.address,
        message: MESSAGE,
        signature: sign(PRINCIPAL_SEGWIT, MESSAGE),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("verifyBip322", () => {
  const signature = sign(PRINCIPAL, MESSAGE);

  it("verifies a real signature by its address", async () => {
    await expect(
      verifyBip322({ address: PRINCIPAL.address, message: MESSAGE, signature }),
    ).resolves.toBe(true);
  });

  it("rejects the same values bound to the wrong names", async () => {
    await expect(
      verifyBip322({ address: MESSAGE, message: signature, signature: PRINCIPAL.address }),
    ).resolves.toBe(false);
    await expect(
      verifyBip322({ address: PRINCIPAL.address, message: signature, signature: MESSAGE }),
    ).resolves.toBe(false);
  });

  it("rejects a signature by another address", async () => {
    await expect(
      verifyBip322({ address: OTHER.address, message: MESSAGE, signature }),
    ).resolves.toBe(false);
  });

  it("accepts hex and surrounding whitespace", async () => {
    const hex = Buffer.from(signature, "base64").toString("hex");
    await expect(
      verifyBip322({ address: PRINCIPAL.address, message: MESSAGE, signature: ` ${hex}\n` }),
    ).resolves.toBe(true);
  });

  it("accepts a legacy signature for a p2pkh address", async () => {
    await expect(
      verifyBip322({
        address: PRINCIPAL_LEGACY.address,
        message: MESSAGE,
        signature: sign(PRINCIPAL_LEGACY, MESSAGE),
      }),
    ).resolves.toBe(true);
  });

  it("returns false on malformed input", async () => {
    await expect(
      verifyBip322({ address: "not-an-address", message: MESSAGE, signature: "!!" }),
    ).resolves.toBe(false);
  });
});
