import type { CSSProperties } from "react";

/*
 * Every type and shape choice in OcWalletPicker and OcWalletButton reads a CSS
 * variable whose fallback is the family look, so a site with a design of its
 * own (@orangecheck/app-design ≥ 1.1.0 sets them all) restyles the wallet step
 * by setting variables on an ancestor, never by forking it. Sites that set
 * none render as before.
 *
 *   --oc-wallet-font           labels, buttons, fields  (ui-monospace, SFMono-Regular, monospace)
 *   --oc-wallet-case           small labels and buttons (uppercase; lowercase where the look is lowercase)
 *   --oc-wallet-tracking       small labels' spacing    (0.18em headings, 0.06em status words)
 *   --oc-wallet-scale          multiplies each size     (1; sizes are 8–12px)
 *   --oc-wallet-strong         names, heading, submit   (600; 700 for the heading)
 *   --oc-wallet-radius         list rows, message, field (6px)
 *   --oc-wallet-button-radius  buttons and row chips    (6px; 4px for Copy; 9999px for chips)
 *   --oc-wallet-min-height     wallet rows, paste buttons (auto)
 *   --oc-wallet-surface        rows, message, field     (--muted at 30% over transparent)
 *   --oc-wallet-ready          a detected wallet's dot  (#22c55e)
 *   --oc-wallet-field-size     the pasted signature     (12px; 16px below 768px wide)
 *   --oc-wallet-mark           display of "§ ", "// ", "← " (inline)
 *
 * Copy is written in sentence case. The fallback case shows it as the family
 * look always did; a site that sets the case to `none` reads it as written.
 */
export const WALLET_FONT =
  "var(--oc-wallet-font, ui-monospace, SFMono-Regular, monospace)";
export const walletCase = (
  fallback: "uppercase" | "lowercase",
): CSSProperties["textTransform"] =>
  `var(--oc-wallet-case, ${fallback})` as CSSProperties["textTransform"];
export const walletTracking = (em: string): string =>
  `var(--oc-wallet-tracking, ${em})`;
export const walletSize = (px: number): string =>
  `calc(${px}px * var(--oc-wallet-scale, 1))`;
export const walletStrong = (weight: number): CSSProperties["fontWeight"] =>
  `var(--oc-wallet-strong, ${weight})` as CSSProperties["fontWeight"];
export const walletRadius = (px: number): string =>
  `var(--oc-wallet-radius, ${px}px)`;
export const walletButtonRadius = (px: number): string =>
  `var(--oc-wallet-button-radius, ${px}px)`;
export const WALLET_MIN_HEIGHT = "var(--oc-wallet-min-height, auto)";
export const WALLET_SURFACE =
  "var(--oc-wallet-surface, color-mix(in oklch, var(--muted, #27272a) 30%, transparent))";
export const WALLET_READY = "var(--oc-wallet-ready, #22c55e)";
// iOS zooms into a field under 16px, and an inline size outranks a
// stylesheet's phone rule, so the fallback carries it: 16px below 768px.
export const WALLET_FIELD_SIZE =
  "var(--oc-wallet-field-size, clamp(12px, calc((768px - 100vw) * 1000), 16px))";
export const WALLET_MARK =
  "var(--oc-wallet-mark, inline)" as CSSProperties["display"];
