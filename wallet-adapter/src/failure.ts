/**
 * What went wrong when a wallet was asked to sign, and one sentence for a
 * person for each. Every family site shows these words, so a wallet's own
 * text ("User rejected the request", "[object Object]") never reaches anyone.
 */

/** Why a sign request failed. */
export type WalletFailure =
  | "rejected"
  | "wrong-account"
  | "not-found"
  | "timed-out"
  | "other";

/** The person declined the request in their wallet. */
export class WalletRejectedError extends Error {
  readonly code = "E_USER_REJECTED" as const;
  /** What the wallet threw. */
  readonly cause: unknown;
  constructor(message = "the signature request was declined in the wallet", cause?: unknown) {
    super(message);
    this.name = "WalletRejectedError";
    this.cause = cause;
  }
}

/** The wallet asked for is not in this browser. */
export class WalletNotFoundError extends Error {
  readonly code = "E_WALLET_NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "WalletNotFoundError";
  }
}

// EIP-1193 4001 (UniSat, OKX, Leather, Phantom) and sats-connect's -32000 (Xverse).
const REJECTED_CODES = new Set<unknown>([4001, -32000, "4001", "USER_REJECTION", "E_USER_REJECTED", "ACTION_REJECTED"]);
const REJECTED_TEXT = /\b(reject(ed)?|denied|declined|cancell?ed)\b/i;
const TIMEOUT_TEXT = /\btimed?\s*-?out\b/i;

/** name, code and message of a thrown value, looking inside a JSON-RPC `error` too. */
function fields(err: unknown): { name: string; code: unknown; message: string } {
  if (typeof err === "string") return { name: "", code: undefined, message: err };
  if (typeof err !== "object" || err === null) return { name: "", code: undefined, message: "" };
  const e = err as { name?: unknown; code?: unknown; message?: unknown; error?: unknown };
  const inner =
    typeof e.error === "object" && e.error !== null
      ? (e.error as { code?: unknown; message?: unknown })
      : {};
  return {
    name: typeof e.name === "string" ? e.name : "",
    code: e.code ?? inner.code,
    message: [e.message, inner.message].filter((m) => typeof m === "string").join(" "),
  };
}

/** Classify anything a wallet or `getSigner` threw. */
export function walletFailure(err: unknown): WalletFailure {
  const { name, code, message } = fields(err);
  if (code === "E_WRONG_ACCOUNT" || name === "WrongAccountError") return "wrong-account";
  if (code === "E_WALLET_NOT_FOUND" || name === "WalletNotFoundError") return "not-found";
  if (name === "TimeoutError" || name === "AbortError" || code === "E_TIMEOUT" || TIMEOUT_TEXT.test(message))
    return "timed-out";
  if (REJECTED_CODES.has(code) || REJECTED_TEXT.test(message)) return "rejected";
  return "other";
}

const TEXT: Record<WalletFailure, { plain: string; paste: string }> = {
  rejected: {
    plain: "The request was declined in your wallet. Sign again when you are ready.",
    paste: "The request was declined in your wallet. Sign again, or paste a signature.",
  },
  "wrong-account": {
    plain: "That signature is not from the address shown. Switch your wallet to that address, then sign again.",
    paste: "That signature is not from the address shown. Switch your wallet to that address, then sign again.",
  },
  "not-found": {
    plain: "That wallet is not in this browser. Install it, or choose another wallet.",
    paste: "That wallet is not in this browser. Choose another wallet, or paste a signature.",
  },
  "timed-out": {
    plain: "Your wallet did not answer. Open it to finish the request, then try again.",
    paste: "Your wallet did not answer. Open it to finish the request, or paste a signature.",
  },
  other: {
    plain: "Your wallet did not sign. Try again.",
    paste: "Your wallet did not sign. Try again, or paste a signature.",
  },
};

/**
 * One sentence for a person about a failed sign request. Pass `paste: true`
 * where the page also offers to paste a signature.
 */
export function walletFailureText(err: unknown, opts: { paste?: boolean } = {}): string {
  const text = TEXT[walletFailure(err)];
  return opts.paste ? text.paste : text.plain;
}

/**
 * What `getSigner` throws for a wallet's own failure: always an Error, with
 * the wallet's code kept, and a declined request as `WalletRejectedError`.
 */
export function toWalletError(err: unknown): Error {
  if (walletFailure(err) === "rejected" && !(err instanceof WalletRejectedError)) {
    const { message } = fields(err);
    return new WalletRejectedError(message || undefined, err);
  }
  if (err instanceof Error) return err;
  const { code, message } = fields(err);
  return Object.assign(new Error(message || String(err)), { code, cause: err });
}
