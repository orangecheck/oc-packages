// A wallet answer over a message or address no longer shown goes to onError, never to onSigned.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The wallet's answer and the paste check are held here; what each checks is sign.test's.
const held = vi.hoisted(() => ({
  answer: null as null | ((sig: string) => void),
  check: null as null | (() => void),
}));
vi.mock("../sign", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sign")>()),
  getSigner: () => () => new Promise<string>((resolve) => (held.answer = resolve)),
  assertSignedBy: () => new Promise<void>((resolve) => (held.check = resolve)),
}));

import { MessageChangedError, walletFailureText } from "../failure";
import { OcWalletButton } from "../react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;

let host: HTMLDivElement;
let root: Root;
let signed: string[];
let failed: Error[];

beforeEach(() => {
  win().unisat = { signMessage: () => new Promise(() => {}) };
  held.answer = null;
  held.check = null;
  signed = [];
  failed = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete win().unisat;
});

const show = (message: string, address = "bc1qtest") =>
  act(async () =>
    root.render(
      <OcWalletButton
        address={address}
        message={message}
        onSigned={(s) => signed.push(s)}
        onError={(e) => failed.push(e)}
      />,
    ),
  );
const press = (label: string) =>
  act(async () =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click(),
  );
const busy = () => host.querySelectorAll('[aria-busy="true"]');

describe("a wallet's answer over a message the page has since changed", () => {
  it("goes to onError as MessageChangedError, not to onSigned", async () => {
    await show("id one");
    await press("Sign with UniSat");
    await show("id two");
    await act(async () => held.answer!("sig-over-id-one"));
    expect(signed).toEqual([]);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBeInstanceOf(MessageChangedError);
    expect(walletFailureText(failed[0])).toBe(
      "The message changed while your wallet signed. Sign the one shown now.",
    );
    expect(busy()).toHaveLength(0);
  });

  it("goes to onError when the address changed instead", async () => {
    await show("id one", "bc1qfirst");
    await press("Sign with UniSat");
    await show("id one", "bc1qsecond");
    await act(async () => held.answer!("sig"));
    expect(signed).toEqual([]);
    expect(failed[0]).toBeInstanceOf(MessageChangedError);
  });

  it("goes to onSigned when the message is still the one shown", async () => {
    await show("id one");
    await press("Sign with UniSat");
    await show("id one");
    await act(async () => held.answer!("sig"));
    expect(signed).toEqual(["sig"]);
    expect(failed).toEqual([]);
  });

  it("pasted, and checked while the message changed, goes to onError too", async () => {
    await show("id one");
    await press("Paste signature (Sparrow / Core / hardware)");
    const field = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        field,
        "pasted-sig",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const use = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Use signature",
    );
    expect(use, "the paste panel's submit").toBeTruthy();
    await act(async () => use!.click());
    await show("id two");
    await act(async () => held.check!());
    expect(signed).toEqual([]);
    expect(failed[0]).toBeInstanceOf(MessageChangedError);
  });
});
