// @vitest-environment node
/**
 * The picker lists what detectWallets() finds, and the site signs with
 * getSigner for the id that was picked. Every way a wallet can be detected
 * must therefore be a way it can sign, or the person picks a wallet and
 * nothing they do works. Each case installs only the globals one detection
 * path reads, then signs with a real key through getSigner.
 */

import * as ecc from "@bitcoinerlab/secp256k1";
import { Address, Signer } from "bip322-js";
import { ECPairFactory } from "ecpair";
import { afterEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window ??= {};

import { detectWallets } from "../detect";
import { getSigner, verifyBip322 } from "../sign";
import type { WalletId } from "../types";

const pair = ECPairFactory(ecc).fromPrivateKey(Buffer.alloc(32, 7));
const ADDRESS = Address.convertPubKeyIntoAddress(pair.publicKey, "p2wpkh").mainnet;
const MESSAGE = "67ea21d93ea2cc2d4ac4aa3527f3a9ff082246c7d81b2f4ead070b893e05e25e";

function sign(m: string): string {
  const sig = Signer.sign(pair.toWIF(), ADDRESS, m);
  return typeof sig === "string" ? sig : Buffer.from(sig).toString("base64");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => (globalThis as any).window as Record<string, unknown>;

const GLOBALS = ["unisat", "XverseProviders", "BitcoinProvider", "LeatherProvider", "btc", "okxwallet", "phantom"];

afterEach(() => {
  for (const g of GLOBALS) delete win()[g];
  vi.restoreAllMocks();
});

/** An Xverse- or Leather-style JSON-RPC provider that signs with the test key. */
function rpc(signed: (m: string) => void) {
  return {
    request: async (method: string, params?: { message: string }) => {
      if (method === "getAddresses") return { result: { addresses: [{ address: ADDRESS }] } };
      if (method === "signMessage") {
        signed(params!.message);
        return { status: "success", result: { signature: sign(params!.message), address: ADDRESS } };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
}

const SHAPES: { id: WalletId; via: string; install: (signed: (m: string) => void) => void }[] = [
  {
    id: "unisat",
    via: "window.unisat",
    install: (signed) => {
      win().unisat = {
        getAccounts: async () => [ADDRESS],
        signMessage: async (m: string) => (signed(m), sign(m)),
      };
    },
  },
  {
    id: "xverse",
    via: "window.XverseProviders.BitcoinProvider",
    install: (signed) => {
      win().XverseProviders = { BitcoinProvider: rpc(signed) };
    },
  },
  {
    id: "xverse",
    via: "window.BitcoinProvider",
    install: (signed) => {
      win().BitcoinProvider = rpc(signed);
    },
  },
  {
    id: "leather",
    via: "window.LeatherProvider",
    install: (signed) => {
      win().LeatherProvider = rpc(signed);
    },
  },
  {
    id: "leather",
    via: "window.btc",
    install: (signed) => {
      win().btc = rpc(signed);
    },
  },
  {
    id: "okx",
    via: "window.okxwallet.bitcoin",
    install: (signed) => {
      win().okxwallet = {
        bitcoin: {
          connect: async () => ({ address: ADDRESS, publicKey: "" }),
          signMessage: async (m: string) => (signed(m), sign(m)),
        },
      };
    },
  },
  {
    id: "phantom",
    via: "window.phantom.bitcoin",
    install: (signed) => {
      win().phantom = {
        bitcoin: {
          requestAccounts: async () => [{ address: ADDRESS, addressType: "p2wpkh" }],
          signMessage: async (bytes: Uint8Array) => {
            const m = new TextDecoder().decode(bytes);
            signed(m);
            return { signature: new Uint8Array(Buffer.from(sign(m), "base64")) };
          },
        },
      };
    },
  },
];

describe("every wallet the picker lists can sign", () => {
  it.each(SHAPES)("$id detected through $via", async ({ id, install }) => {
    const signed = vi.fn();
    install(signed);

    const listed = detectWallets()
      .filter((w) => w.detected && !w.isManual)
      .map((w) => w.id);
    expect(listed).toEqual([id]);

    const signature = await getSigner(id, { address: ADDRESS })(MESSAGE);
    expect(signed).toHaveBeenCalledWith(MESSAGE);
    expect(await verifyBip322({ address: ADDRESS, message: MESSAGE, signature })).toBe(true);
  });

  it("covers every wallet detectWallets can list", () => {
    const listable = detectWallets()
      .filter((w) => !w.isManual)
      .map((w) => w.id);
    expect(new Set(SHAPES.map((s) => s.id))).toEqual(new Set(listable));
  });
});
