/**
 * The wallet list has its rows from the first render, so a form that mounts it
 * does not grow by a whole list a frame later and push what is below it down.
 * Detection still runs after mount and only changes each row's state. The
 * server's HTML and the client's first render agree, so hydrating is quiet.
 */

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OcWalletButton, OcWalletPicker } from "../react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;

const NAMES = ["UniSat", "Xverse", "Leather", "OKX", "Phantom", "Paste signature"];

const button = () => (
  <OcWalletButton address="bc1qtest" message={"m\n"} onSigned={() => {}} />
);
const picker = () => <OcWalletPicker value={null} onChange={() => {}} layout="list" />;

afterEach(() => {
  delete win().unisat;
  document.body.innerHTML = "";
});

describe("the wallet list on its first render", () => {
  it.each([
    ["OcWalletButton", button],
    ["OcWalletPicker", picker],
  ])("%s renders every listed wallet before detection runs", (_, el) => {
    const html = renderToString(el());
    for (const name of NAMES) expect(html).toContain(name);
    expect(html.match(/data-oc-wallet-(button|picker)-option=""/g) ?? []).toHaveLength(
      NAMES.length,
    );
  });

  it("hydrates without a mismatch, then marks the installed wallet", async () => {
    const html = renderToString(button());
    win().unisat = { signMessage: async () => "sig" };
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const rows = () => host.querySelectorAll("[data-oc-wallet-button-option]");
    const rowsBefore = rows().length;
    expect(rowsBefore).toBe(NAMES.length);
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(host, button(), { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(rows().length).toBe(rowsBefore);
    const unisat = Array.from(rows()).find((b) => b.textContent?.includes("UniSat"));
    expect(unisat?.getAttribute("data-status")).toBe("ready");
  });
});
