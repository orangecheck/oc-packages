/**
 * What a screen reader hears: each wallet control is found by its role and
 * its accessible name, computed as a browser does (dom-accessibility-api),
 * and its state is a description read after the name, never part of it.
 */

import { computeAccessibleDescription, computeAccessibleName, getRole } from "dom-accessibility-api";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OcWalletButton, OcWalletPicker } from "../react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;

let host: HTMLDivElement;
let root: Root;

/** Every element with this role, by accessible name. */
function byRole(role: string): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const el of Array.from(host.querySelectorAll("*"))) {
    if (getRole(el) === role) found.set(computeAccessibleName(el), el);
  }
  return found;
}

beforeEach(() => {
  // UniSat is installed and its signature never arrives, so "Signing…" stays up.
  win().unisat = { signMessage: () => new Promise(() => {}) };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete win().unisat;
});

describe("OcWalletButton", () => {
  it("names each wallet by what a press does, and reads its state after", async () => {
    await act(async () =>
      root.render(<OcWalletButton address="bc1qtest" message="msg" onSigned={() => {}} />),
    );
    const buttons = byRole("button");
    const unisat = buttons.get("Sign with UniSat");
    expect(unisat, [...buttons.keys()].join(" | ")).toBeDefined();
    expect(computeAccessibleDescription(unisat!)).toBe("Ready");
    const xverse = buttons.get("Install Xverse");
    expect(xverse).toBeDefined();
    expect(computeAccessibleDescription(xverse!)).toBe("Install");
    // No name carries the dot or the state.
    for (const name of buttons.keys()) expect(name).not.toMatch(/[●○◌]|Ready$/);
  });

  it("keeps the name while it signs; the state says so", async () => {
    await act(async () =>
      root.render(<OcWalletButton address="bc1qtest" message="msg" onSigned={() => {}} />),
    );
    await act(async () => (byRole("button").get("Sign with UniSat") as HTMLElement).click());
    const unisat = byRole("button").get("Sign with UniSat");
    expect(unisat).toBeDefined();
    expect(computeAccessibleDescription(unisat!)).toBe("Signing…");
    expect(unisat!.getAttribute("aria-busy")).toBe("true");
  });
});

describe("OcWalletPicker", () => {
  it("names each radio by its wallet, and reads its state after", async () => {
    await act(async () => root.render(<OcWalletPicker value={null} onChange={() => {}} />));
    const radios = byRole("radio");
    const unisat = radios.get("UniSat");
    expect(unisat, [...radios.keys()].join(" | ")).toBeDefined();
    expect(computeAccessibleDescription(unisat!)).toBe("Ready");
    expect(computeAccessibleDescription(radios.get("Xverse")!)).toBe("Install");
  });
});
