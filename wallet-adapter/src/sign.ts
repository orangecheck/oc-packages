import type { SignFn, SignOptions, WalletId } from "./types";

/**
 * The wallet produced a signature that is not from the requested address —
 * usually because it signed with its active account. `activeAddress` is set
 * when the wallet reported which account that was.
 */
export class WrongAccountError extends Error {
  readonly code = "E_WRONG_ACCOUNT" as const;
  constructor(
    readonly requestedAddress: string,
    readonly activeAddress?: string,
  ) {
    super(
      activeAddress
        ? `wallet signed with ${activeAddress}, switch to ${requestedAddress} and sign again`
        : `the signature does not verify for ${requestedAddress}; switch the wallet to ${requestedAddress} and sign again`,
    );
    this.name = "WrongAccountError";
  }
}

function hexToBase64(hex: string): string {
  let bin = "";
  for (let i = 0; i < hex.length; i += 2)
    bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin);
}

/**
 * Whether `signature` is a valid BIP-322 (or legacy BIP-137) signature of
 * `message` by `address`. Accepts base64 or hex. Never throws.
 */
export async function verifyBip322({
  address,
  message,
  signature,
}: {
  address: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  const { Verifier } = await import("bip322-js");
  const check = (sig: string) => {
    try {
      return Verifier.verifySignature(address, message, sig);
    } catch {
      return false;
    }
  };
  const sig = signature.trim();
  if (check(sig)) return true;
  return HEX_RE.test(sig) && sig.length % 2 === 0 && check(hexToBase64(sig));
}

/**
 * Throw `WrongAccountError` unless `signature` is a valid BIP-322 (or legacy)
 * signature of `message` by `address`. Every signer runs this before returning.
 */
export async function assertSignedBy(args: {
  address: string;
  message: string;
  signature: string;
}): Promise<void> {
  if (!(await verifyBip322(args))) throw new WrongAccountError(args.address);
}

/** Signatures from every supported wallet are either base64 or hex. Anything
 * else is malformed (or HTML pasted into the manual prompt) and the verifier
 * will reject it — catch the shape error here where we can say *why*. */
const BASE64_RE = /^[A-Za-z0-9+/_=-]+$/;
const HEX_RE = /^[0-9a-fA-F]+$/;

function assertPlausibleSignature(sig: string): string {
  const trimmed = sig.trim();
  if (!trimmed) throw new Error("empty signature");
  if (trimmed.length < 10 || trimmed.length > 2048) {
    throw new Error(`signature length out of range: ${trimmed.length}`);
  }
  if (!BASE64_RE.test(trimmed) && !HEX_RE.test(trimmed)) {
    throw new Error(
      "signature is not base64 or hex — wallet may have returned an error message or HTML",
    );
  }
  return trimmed;
}

/**
 * Return a SignFn bound to a particular wallet. The returned function takes a
 * canonical message string and resolves to a BIP-322 signature.
 *
 *   const sign = getSigner('unisat', { address });
 *   const signature = await sign(challenge.message);
 *
 * Throws on unknown wallet IDs or when the wallet isn't available on window.
 */
export function getSigner(wallet: WalletId, opts: SignOptions): SignFn {
  const inner: SignFn = (() => {
    switch (wallet) {
      case "unisat":
        return signWithUnisat(opts);
      case "xverse":
        return signWithXverse(opts);
      case "leather":
        return signWithLeather(opts);
      case "alby":
        return signWithAlby();
      case "okx":
        return signWithOkx(opts);
      case "phantom":
        return signWithPhantom(opts);
      case "manual":
        return signManual(opts);
    }
  })();
  // Nothing leaves this package unless it is well-formed and verifies for the
  // requested address.
  return async (message) => {
    const sig = assertPlausibleSignature(await inner(message));
    await assertSignedBy({ address: opts.address, message, signature: sig });
    return sig;
  };
}

function signWithUnisat(opts: SignOptions): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          unisat?: {
            signMessage?: (m: string, t?: string) => Promise<string>;
            getAccounts?: () => Promise<string[]>;
          };
        };
      }
    ).window;
    if (!w?.unisat?.signMessage)
      throw new Error("UniSat wallet not found on window.unisat");
    // UniSat signs with its active account and takes no address.
    if (w.unisat.getAccounts) {
      const [active] = await w.unisat.getAccounts();
      if (active && active !== opts.address)
        throw new WrongAccountError(opts.address, active);
    }
    // UniSat exposes two modes: `bip322-simple` (what the verifier wants)
    // and the default ECDSA `signmessage` (what the verifier won't
    // accept for segwit/taproot addresses). The old code silently fell
    // back to the default on any error, which meant users got legacy-ECDSA
    // signatures their P2WPKH/P2TR addresses couldn't validate. Stick to
    // BIP-322 and let the error propagate — the UI can suggest switching
    // wallets or using paste mode.
    return await w.unisat.signMessage(message, "bip322-simple");
  };
}

function signWithXverse(opts: SignOptions): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          BitcoinProvider?: {
            request?: (method: string, params: unknown) => Promise<unknown>;
          };
        };
      }
    ).window;
    const provider = w?.BitcoinProvider;
    if (!provider?.request)
      throw new Error("Xverse wallet not found on window.BitcoinProvider");
    // Xverse's RPC returns { status, result: { signature, ... } }.
    const r = (await provider.request("signMessage", {
      address: opts.address,
      message,
      protocol: "BIP322",
    })) as { status?: string; result?: { signature?: string } };
    if (r.status !== "success" || !r.result?.signature) {
      throw new Error(`Xverse signMessage failed: ${r.status ?? "unknown"}`);
    }
    return r.result.signature;
  };
}

function signWithLeather(opts: SignOptions): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          LeatherProvider?: {
            request?: (method: string, params?: unknown) => Promise<unknown>;
          };
          btc?: {
            request?: (method: string, params?: unknown) => Promise<unknown>;
          };
        };
      }
    ).window;
    const provider = w?.LeatherProvider ?? w?.btc;
    if (!provider?.request)
      throw new Error("Leather wallet not found on window.LeatherProvider");
    // Leather signs with the active account's key of the given paymentType
    // and takes no address, so confirm the account holds the requested one.
    const accounts = await leatherAddresses(provider.request);
    if (accounts && !accounts.includes(opts.address)) {
      const taproot = opts.address.toLowerCase().startsWith("bc1p");
      const sameType = accounts.find(
        (a) => a.toLowerCase().startsWith("bc1p") === taproot,
      );
      throw new WrongAccountError(opts.address, sameType);
    }
    // Pick paymentType from the address shape — taproot vs segwit produce
    // different sighash digests, so the wrong one fails verification.
    const paymentType = opts.address.toLowerCase().startsWith("bc1p")
      ? "p2tr"
      : "p2wpkh";
    const r = (await provider.request("signMessage", {
      message,
      paymentType,
    })) as {
      result?: { signature?: string };
    };
    if (!r.result?.signature) {
      throw new Error("Leather signMessage returned no signature");
    }
    return r.result.signature;
  };
}

/** The active Leather account's addresses, or null if the wallet will not say. */
async function leatherAddresses(
  request: (method: string, params?: unknown) => Promise<unknown>,
): Promise<string[] | null> {
  try {
    const r = (await request("getAddresses")) as {
      result?: { addresses?: Array<{ address?: string }> };
    };
    const list = r.result?.addresses
      ?.map((a) => a.address)
      .filter((a): a is string => typeof a === "string");
    return list && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

function signWithOkx(opts: SignOptions): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          okxwallet?: {
            bitcoin?: {
              connect?: () => Promise<{ address: string }>;
              signMessage?: (m: string, t?: string) => Promise<string>;
            };
          };
        };
      }
    ).window;
    const okx = w?.okxwallet?.bitcoin;
    if (!okx?.signMessage)
      throw new Error("OKX wallet not found on window.okxwallet.bitcoin");
    if (okx.connect) {
      const { address } = await okx.connect();
      if (opts.address && address !== opts.address) {
        throw new WrongAccountError(opts.address, address);
      }
    }
    return await okx.signMessage(message, "bip322-simple");
  };
}

function signWithPhantom(opts: SignOptions): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          phantom?: {
            bitcoin?: {
              requestAccounts?: () => Promise<
                Array<{ address: string; addressType: string }>
              >;
              signMessage?: (
                m: Uint8Array,
                addressType?: string,
              ) => Promise<{ signature: Uint8Array }>;
            };
          };
        };
      }
    ).window;
    const phantom = w?.phantom?.bitcoin;
    if (!phantom?.signMessage)
      throw new Error("Phantom wallet not found on window.phantom.bitcoin");
    if (!phantom.requestAccounts)
      throw new Error("Phantom: requestAccounts unavailable");
    const accounts = await phantom.requestAccounts();
    if (accounts.length === 0) throw new Error("Phantom returned no accounts");
    // Refuse rather than fall back to accounts[0]. The caller asked for a
    // specific address because the challenge message NAMES it — signing
    // with a different account produces a signature the verifier rejects,
    // and the user sees "invalid signature" instead of the one thing that
    // would fix it. signWithOkx, forty lines up, already says this out
    // loud; this path guessed.
    const match = opts.address
      ? accounts.find((a) => a.address === opts.address)
      : accounts[0];
    if (!match) {
      const available = accounts.map((a) => a.address).join(", ");
      throw new Error(
        `Phantom has no account for ${opts.address} — available: ${available}. ` +
          `Switch to it in the wallet to sign.`,
      );
    }
    const bytes = new TextEncoder().encode(message);
    const res = await phantom.signMessage(bytes, match.addressType);
    // Phantom returns Uint8Array; the family verifier wants base64.
    return btoa(String.fromCharCode(...res.signature));
  };
}

function signWithAlby(): SignFn {
  return async (message) => {
    const w = (
      globalThis as unknown as {
        window?: {
          webln?: {
            enable?: () => Promise<unknown>;
            signMessage?: (
              m: string,
            ) => Promise<string | { signature: string }>;
          };
        };
      }
    ).window;
    if (!w?.webln?.signMessage)
      throw new Error("Alby / WebLN not found on window.webln");
    if (w.webln.enable) await w.webln.enable();
    const r = await w.webln.signMessage(message);
    // Alby variants return either the raw string or { signature }.
    if (typeof r === "string") return r;
    if (r && typeof r === "object" && typeof r.signature === "string")
      return r.signature;
    throw new Error("Alby signMessage returned an unexpected shape");
  };
}

/**
 * Manual / paste fallback. Opens a browser prompt showing the canonical
 * message and asks the user to paste the signature. Works for Sparrow,
 * Bitcoin Core, hardware wallets via PSBT — anything that can produce a
 * BIP-322 or legacy signature out-of-band.
 *
 * In React apps, use `<OcWalletButton>` which renders a custom modal with a
 * copy-to-clipboard + proper textarea instead of browser prompts.
 */
function signManual(opts: SignOptions): SignFn {
  return async (message) => {
    if (typeof window === "undefined") {
      throw new Error("Manual signing requires a browser environment");
    }
    const heading =
      opts.manualPrompt ??
      "Sign the following message in your wallet, then paste the signature:";
    const full = `${heading}\n\n--- MESSAGE START ---\n${message}\n--- MESSAGE END ---`;
    const sig = window.prompt(full);
    if (!sig) throw new Error("Manual signing cancelled");
    return sig.trim();
  };
}
