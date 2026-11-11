/**
 * aria-busy on a wallet's option is a contract: app-design's SignMessage reads
 * [aria-busy="true"] in its wallets slot to hold the paste submit while a
 * wallet signs. It is set while the wallet is asked and dropped once the
 * wallet answers, a signature or a refusal.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The wallet's answer is held here; what getSigner checks of it is sign.test's.
vi.mock("../sign", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../sign")>()),
  getSigner: () => () =>
    new Promise<string>((resolve, reject) => (answer = { resolve, reject })),
}));

import { OcWalletButton } from "../react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;

let host: HTMLDivElement;
let root: Root;
let answer: { resolve: (sig: string) => void; reject: (e: Error) => void };

beforeEach(() => {
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

const unisat = () =>
  host.querySelector<HTMLButtonElement>('button[aria-label="Sign with UniSat"]')!;
const busy = () => host.querySelectorAll('[aria-busy="true"]');

describe("OcWalletButton aria-busy", () => {
  it("is set while the wallet signs and dropped once it hands back a signature", async () => {
    const signed: string[] = [];
    await act(async () =>
      root.render(
        <OcWalletButton address="bc1qtest" message="msg" onSigned={(s) => signed.push(s)} />,
      ),
    );
    expect(busy()).toHaveLength(0);
    await act(async () => unisat().click());
    expect(Array.from(busy())).toEqual([unisat()]);
    await act(async () => answer.resolve("sig"));
    expect(signed).toEqual(["sig"]);
    expect(busy()).toHaveLength(0);
  });

  it("is dropped once the wallet refuses", async () => {
    const failed: string[] = [];
    await act(async () =>
      root.render(
        <OcWalletButton
          address="bc1qtest"
          message="msg"
          onSigned={() => {}}
          onError={(e) => failed.push(e.message)}
        />,
      ),
    );
    await act(async () => unisat().click());
    expect(Array.from(busy())).toEqual([unisat()]);
    await act(async () => answer.reject(new Error("User rejected")));
    expect(failed).toHaveLength(1);
    expect(busy()).toHaveLength(0);
  });
});
