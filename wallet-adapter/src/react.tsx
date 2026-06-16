/**
 * <OcWalletButton />
 *
 * Detects installed browser Bitcoin wallets and lets the user pick one. When
 * clicked, calls the wallet's sign API with the `message` you supply and
 * passes the signature to `onSigned`. Falls back to a manual/paste option so
 * Sparrow, Bitcoin Core, and hardware wallets still work.
 *
 *   <OcWalletButton
 *     address={userAddr}
 *     message={challenge.message}
 *     onSigned={(sig) => postVerify({ signature: sig })}
 *   />
 */

import type { CSSProperties, ReactNode } from "react";
import type { WalletId, WalletInfo } from "./types";

import { useEffect, useMemo, useRef, useState } from "react";

import { detectWallets } from "./detect";
import { getSigner } from "./sign";

// ─────────────────────────────────────────────────────────────────────────
// <OcWalletPicker /> — controlled radio-group of detected wallets
// ─────────────────────────────────────────────────────────────────────────

export interface OcWalletPickerProps {
  /** Currently-selected wallet id. */
  value: WalletId | null;
  /** Called when the user picks a wallet. */
  onChange: (id: WalletId) => void;
  /** When `true`, hide wallets that aren't installed. Default: keep them visible with an install link on click. */
  hideUninstalled?: boolean;
  /** Show the manual-paste fallback. Default `true`. */
  showManual?: boolean;
  /** Auto-pick when there's exactly one detected real wallet. Default `true`. */
  autoPickIfSingle?: boolean;
  /** Layout: 'row' (horizontal chips, default) or 'list' (full-width buttons). */
  layout?: "row" | "list";
  /** className for the root `<div>` (e.g. spacing in your form). */
  className?: string;
  /** Optional label rendered above the picker. */
  label?: ReactNode;
}

/**
 * One unified wallet picker for every ochk.io site. Auto-detects browser
 * Bitcoin wallets, surfaces them as terminal-style radio chips, falls back
 * to a manual-paste option for hardware/CLI wallets. Theme-aware via CSS
 * variables (`--background`, `--foreground`, `--border`, `--muted`,
 * `--muted-foreground`, `--primary`); reasonable dark-mode hex fallbacks
 * if a consumer hasn't defined the tokens.
 *
 *   const [wallet, setWallet] = useState<WalletId | null>(null);
 *   …
 *   <OcWalletPicker value={wallet} onChange={setWallet} label="wallet" />
 *
 * Pair with `getSigner(wallet, { address })` from this package to do the
 * actual signing once the user picks + clicks Submit on your form.
 */
export function OcWalletPicker({
  value,
  onChange,
  hideUninstalled = false,
  showManual = true,
  autoPickIfSingle = true,
  layout = "row",
  className,
  label,
}: OcWalletPickerProps) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Wallets are browser-globals; detect after mount only to avoid SSR mismatch.
  useEffect(() => {
    setWallets(detectWallets());
    setHydrated(true);
  }, []);

  const visible = useMemo(() => {
    return wallets.filter((w) => {
      if (!showManual && w.isManual) return false;
      if (hideUninstalled && !w.detected && !w.isManual) return false;
      return true;
    });
  }, [wallets, hideUninstalled, showManual]);

  // Auto-pick when a single real wallet is the only detected option.
  useEffect(() => {
    if (!hydrated || !autoPickIfSingle || value != null) return;
    const realDetected = wallets.filter((w) => w.detected && !w.isManual);
    if (realDetected.length === 1) {
      onChange(realDetected[0]!.id);
    }
  }, [hydrated, autoPickIfSingle, value, wallets, onChange]);

  function handlePick(w: WalletInfo) {
    if (!w.detected && !w.isManual) {
      // Open install page in a new tab; don't silently change selection.
      if (w.installUrl)
        window.open(w.installUrl, "_blank", "noopener,noreferrer");
      return;
    }
    onChange(w.id);
  }

  const isRow = layout === "row";

  return (
    <div
      className={className}
      data-oc-wallet-picker=""
      style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
    >
      {label ? (
        <div
          data-oc-wallet-picker-label=""
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--primary, #f97316)",
            marginBottom: 8,
          }}
        >
          § {label}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label="Wallet"
        style={{
          display: "flex",
          flexDirection: isRow ? "row" : "column",
          flexWrap: isRow ? "wrap" : "nowrap",
          gap: 6,
        }}
      >
        {visible.map((w) => {
          const selected = value === w.id;
          const isInstall = !w.detected && !w.isManual;
          const statusLabel = w.isManual
            ? "paste"
            : w.detected
              ? "ready"
              : "install";
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handlePick(w)}
              data-oc-wallet-picker-option=""
              data-selected={selected ? "" : undefined}
              data-status={
                w.detected ? "ready" : w.isManual ? "manual" : "install"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: isRow ? "6px 10px" : "8px 12px",
                background: selected
                  ? "color-mix(in oklch, var(--primary, #f97316) 12%, transparent)"
                  : "color-mix(in oklch, var(--muted, #27272a) 30%, transparent)",
                color: "var(--foreground, #fafafa)",
                border: selected
                  ? "1px solid var(--primary, #f97316)"
                  : "1px solid var(--border, #27272a)",
                borderRadius: isRow ? 9999 : 6,
                fontFamily: "inherit",
                fontSize: 12,
                cursor: isInstall ? "pointer" : "pointer",
                opacity: isInstall ? 0.7 : 1,
                width: isRow ? "auto" : "100%",
                justifyContent: isRow ? "flex-start" : "space-between",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: 8,
                  color: w.detected
                    ? "#22c55e"
                    : w.isManual
                      ? "var(--muted-foreground, #a1a1aa)"
                      : "var(--muted-foreground, #a1a1aa)",
                }}
              >
                {w.detected ? "●" : w.isManual ? "◌" : "○"}
              </span>
              <span style={{ fontWeight: 600 }}>{w.name}</span>
              <span
                style={{
                  color: "var(--muted-foreground, #a1a1aa)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginLeft: isRow ? 4 : "auto",
                }}
              >
                {statusLabel}
              </span>
            </button>
          );
        })}
      </div>
      {hydrated && visible.every((w) => !w.detected && !w.isManual) && (
        <p
          style={{
            marginTop: 8,
            color: "var(--muted-foreground, #a1a1aa)",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {"// "}no browser wallet detected — install one above, or use{" "}
          <em>paste signature</em> with Sparrow / Bitcoin Core / hardware.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// <OcWalletButton /> — pick + sign in one click (existing primitive)
// ─────────────────────────────────────────────────────────────────────────

export interface OcWalletButtonProps {
  /** Bitcoin address the user is signing under. */
  address: string;
  /**
   * Canonical message to sign. If you already have a `<OcChallengeButton>`
   * managing the challenge flow, use that instead — this component is the
   * lower-level primitive for custom flows that need a pre-built wallet
   * picker.
   */
  message: string;
  /** Called with the BIP-322 signature on success. */
  onSigned: (signature: string, walletId: WalletId) => void;
  /** Called if signing fails (user cancels, wallet errors, etc). */
  onError?: (err: Error, walletId: WalletId) => void;

  /** Hide wallets that aren't installed. Default `false` (they render as install prompts). */
  hideUninstalled?: boolean;
  /** Show the manual-paste fallback. Default `true`. */
  showManual?: boolean;
  /** className for the root `<div>`. */
  className?: string;
  style?: CSSProperties;
  /** Text for the header above the wallet list. Default "Sign with your wallet". */
  heading?: ReactNode;
  /** Text when no browser wallets are installed. */
  emptyState?: ReactNode;
  /** Visual: 'list' (default, full-width buttons) or 'row' (chip pills). */
  layout?: "list" | "row";
}

export function OcWalletButton({
  address,
  message,
  onSigned,
  onError,
  hideUninstalled = false,
  className,
  style,
  heading = "Sign with your wallet",
  emptyState,
  layout = "list",
  showManual = true,
}: OcWalletButtonProps) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [busyId, setBusyId] = useState<WalletId | null>(null);
  // The manual / paste wallet opens an INLINE panel (message + copy + textarea),
  // NOT a native window.prompt() — `manual` is the open panel's state.
  const [manual, setManual] = useState<{
    walletId: WalletId;
    sig: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  // The signing SDKs return a promise we can't actually cancel (a wallet
  // prompt is driven by the extension), so we race the promise against a
  // cancellation generation counter: if the user bails out and picks a
  // different wallet (or unmounts), we ignore any late result.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Wallets are browser-globals — detect only after mount to avoid SSR mismatch.
  useEffect(() => {
    setWallets(detectWallets());
  }, []);

  const visible = useMemo(
    () =>
      wallets.filter((w) => {
        if (!showManual && w.isManual) return false;
        if (hideUninstalled && !w.detected && !w.isManual) return false;
        return true;
      }),
    [wallets, hideUninstalled, showManual],
  );

  const handleSign = async (wallet: WalletInfo) => {
    if (busyId) return;
    if (!wallet.detected && !wallet.isManual) {
      window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // The manual / paste wallet must NOT call the prompt()-based signer — open
    // the inline paste panel instead of a native browser dialog. This is the
    // family-wide fix: every consumer using OcWalletButton gets a real textarea.
    if (wallet.isManual) {
      requestIdRef.current += 1; // drop any in-flight real-wallet sign
      setBusyId(null);
      setCopied(false);
      setManual({ walletId: wallet.id, sig: "" });
      return;
    }
    const rid = ++requestIdRef.current;
    setBusyId(wallet.id);
    try {
      const sig = await getSigner(wallet.id, { address })(message);
      // Drop the result if the user cancelled (different wallet picked,
      // or component unmounted). Prevents "I clicked UniSat, closed it,
      // clicked Xverse — now both popped up" confusion.
      if (requestIdRef.current !== rid || !mountedRef.current) return;
      onSigned(sig, wallet.id);
    } catch (err) {
      if (requestIdRef.current !== rid || !mountedRef.current) return;
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e, wallet.id);
    } finally {
      if (requestIdRef.current === rid && mountedRef.current) {
        setBusyId(null);
      }
    }
  };

  const cancel = () => {
    requestIdRef.current += 1;
    setBusyId(null);
  };

  const isRow = layout === "row";

  return (
    <div
      className={className}
      data-oc-wallet-button=""
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        ...style,
      }}
    >
      {heading && (
        <div
          data-oc-wallet-button-heading=""
          style={{
            marginBottom: 10,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--primary, #f97316)",
          }}
        >
          § {heading}
        </div>
      )}

      {manual ? (
        <div
          data-oc-wallet-button-manual=""
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--muted-foreground, #a1a1aa)",
              lineHeight: 1.4,
            }}
          >
            Sign this message in your wallet (Sparrow, Bitcoin Core, hardware),
            then paste the signature below.
          </div>
          <div style={{ position: "relative" }}>
            <pre
              style={{
                margin: 0,
                padding: "8px 10px",
                maxHeight: 96,
                overflow: "auto",
                background:
                  "color-mix(in oklch, var(--muted, #27272a) 30%, transparent)",
                border: "1px solid var(--border, #27272a)",
                borderRadius: 6,
                color: "var(--foreground, #fafafa)",
                fontFamily: "inherit",
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {message}
            </pre>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(message).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  },
                  () => {},
                );
              }}
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                padding: "2px 8px",
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                borderRadius: 4,
                background: "var(--background, #09090b)",
                color: "var(--muted-foreground, #a1a1aa)",
                border: "1px solid var(--border, #27272a)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <textarea
            value={manual.sig}
            onChange={(e) =>
              setManual({ walletId: manual.walletId, sig: e.target.value })
            }
            placeholder="Paste the signature…"
            rows={3}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            data-oc-wallet-button-manual-input=""
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              resize: "vertical",
              background:
                "color-mix(in oklch, var(--muted, #27272a) 30%, transparent)",
              border: "1px solid var(--border, #27272a)",
              borderRadius: 6,
              color: "var(--foreground, #fafafa)",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!manual.sig.trim()}
              onClick={() => {
                const sig = manual.sig.trim();
                if (!sig) return;
                const wid = manual.walletId;
                setManual(null);
                onSigned(sig, wid);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                cursor: manual.sig.trim() ? "pointer" : "not-allowed",
                opacity: manual.sig.trim() ? 1 : 0.4,
                background: "var(--primary, #f97316)",
                color: "var(--primary-foreground, #0a0a0a)",
                border: "1px solid var(--primary, #f97316)",
              }}
            >
              Use signature
            </button>
            <button
              type="button"
              onClick={() => setManual(null)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 12,
                background: "transparent",
                color: "var(--muted-foreground, #a1a1aa)",
                border: "1px solid var(--border, #27272a)",
                cursor: "pointer",
              }}
            >
              ← back
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-foreground, #a1a1aa)",
            lineHeight: 1.4,
          }}
        >
          {emptyState ??
            "// no Bitcoin wallets detected — install UniSat, Xverse, Leather, Alby, OKX, or Phantom, or paste a signature."}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: isRow ? "row" : "column",
            flexWrap: isRow ? "wrap" : "nowrap",
            gap: isRow ? 6 : 6,
          }}
        >
          {visible.map((w) => {
            const busy = busyId === w.id;
            const disabled = Boolean(busyId) && !busy;
            const isInstall = !w.detected && !w.isManual;
            const statusLabel = busy
              ? "signing…"
              : w.isManual
                ? "paste"
                : w.detected
                  ? "ready"
                  : "install";
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => handleSign(w)}
                disabled={disabled}
                aria-busy={busy}
                data-oc-wallet-button-option=""
                data-status={
                  w.detected ? "ready" : w.isManual ? "manual" : "install"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: isRow ? "6px 10px" : "8px 12px",
                  background:
                    "color-mix(in oklch, var(--muted, #27272a) 30%, transparent)",
                  color: "var(--foreground, #fafafa)",
                  border: "1px solid var(--border, #27272a)",
                  borderRadius: isRow ? 9999 : 6,
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : isInstall ? 0.7 : 1,
                  width: isRow ? "auto" : "100%",
                  justifyContent: isRow ? "flex-start" : "space-between",
                  transition: "background 120ms, border-color 120ms",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 8,
                    color: w.detected
                      ? "#22c55e"
                      : "var(--muted-foreground, #a1a1aa)",
                  }}
                >
                  {w.detected ? "●" : w.isManual ? "◌" : "○"}
                </span>
                <span style={{ fontWeight: 600 }}>{w.name}</span>
                <span
                  style={{
                    color: "var(--muted-foreground, #a1a1aa)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginLeft: isRow ? 4 : "auto",
                  }}
                >
                  {statusLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {busyId && !manual && (
        <button
          type="button"
          onClick={cancel}
          style={{
            marginTop: 8,
            padding: "4px 0",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--muted-foreground, #a1a1aa)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: "inherit",
          }}
        >
          cancel pending sign
        </button>
      )}
    </div>
  );
}
