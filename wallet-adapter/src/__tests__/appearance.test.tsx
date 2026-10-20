/**
 * OcWalletPicker and OcWalletButton read the --oc-wallet-* variables, and each
 * fallback is the family look: resolved with nothing set, every style is the
 * value 0.5.2 hard-coded; resolved with app-design's values, it is that design.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OcWalletButton, OcWalletPicker } from "../react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;

/** var(--oc-wallet-*) as a browser computes it: the set value, else the fallback. */
function resolve(value: string, vars: Record<string, string>): string {
  const start = value.indexOf("var(--oc-wallet-");
  if (start < 0) return value.replace(/calc\(([\d.]+)px \* 1\)/g, "$1px");
  let depth = 0;
  let comma = -1;
  let end = -1;
  for (let i = start + 4; i < value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")" && depth-- === 0) {
      end = i;
      break;
    } else if (c === "," && depth === 0 && comma < 0) comma = i;
  }
  const name = value.slice(start + 4, comma < 0 ? end : comma).trim();
  const fallback = comma < 0 ? "" : value.slice(comma + 1, end).trim();
  const used = vars[name] ?? fallback;
  return resolve(value.slice(0, start) + used + value.slice(end + 1), vars);
}

/** The --oc-wallet-* values app-design sets for its light theme. */
function appDesignVars(): Record<string, string> {
  const css = readFileSync(
    join(__dirname, "../../../app-design/src/styles/tokens.css"),
    "utf8",
  );
  const vars: Record<string, string> = {};
  for (const m of css.matchAll(/(--oc-wallet-[\w-]+):\s*([^;]+);/g)) {
    vars[m[1]!] ??= m[2]!.trim();
  }
  return vars;
}

const NONE: Record<string, string> = {};
const css = (el: Element | null | undefined, prop: string, vars = NONE) =>
  resolve((el as HTMLElement).style.getPropertyValue(prop), vars);

let host: HTMLDivElement;
let root: Root;

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
async function click(el: Element | undefined) {
  await act(async () => (el as HTMLElement).click());
}
const buttons = (scope: ParentNode = host) =>
  Array.from(scope.querySelectorAll("button"));
const byText = (text: string) =>
  Array.from(host.querySelectorAll("span, button, div")).find(
    (el) => el.textContent === text,
  );
const option = (name: string, scope: ParentNode = host) =>
  buttons(scope).find((b) => b.textContent?.includes(name));
const inButton = () => host.querySelector("[data-oc-wallet-button]")!;

beforeEach(() => {
  // A detected UniSat whose signature never arrives, so "Signing…" stays up.
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

const button = (
  <OcWalletButton address="bc1qtest" message="msg" onSigned={() => {}} />
);

describe("fallbacks: a site that sets nothing gets 0.5.2's look", () => {
  it("the wallet list", async () => {
    await render(button);
    const rootEl = host.firstElementChild;
    expect(css(rootEl, "font-family")).toBe(
      "ui-monospace, SFMono-Regular, monospace",
    );

    const heading = host.querySelector("[data-oc-wallet-button-heading]");
    expect(css(heading, "font-size")).toBe("10px");
    expect(css(heading, "font-weight")).toBe("700");
    expect(css(heading, "letter-spacing")).toBe("0.18em");
    expect(css(heading, "text-transform")).toBe("uppercase");
    const mark = heading?.querySelector("[aria-hidden]");
    expect(mark?.textContent).toBe("§ ");
    expect(css(mark, "display")).toBe("inline");

    const row = option("UniSat");
    expect(css(row, "font-size")).toBe("12px");
    expect(css(row, "border-radius")).toBe("6px");
    expect(css(row, "min-height")).toBe("auto");
    expect(css(row, "background")).toBe(
      "color-mix(in oklch, var(--muted, #27272a) 30%, transparent)",
    );
    const [dot, name, status] = Array.from(row!.children);
    expect(css(dot, "color")).toBe("#22c55e");
    expect(css(dot, "font-size")).toBe("8px");
    expect(css(name, "font-weight")).toBe("600");
    expect(status?.textContent).toBe("Ready");
    expect(css(status, "text-transform")).toBe("uppercase");
    expect(css(status, "letter-spacing")).toBe("0.06em");
    expect(css(status, "font-size")).toBe("10px");
  });

  it("row chips stay pills", async () => {
    await render(
      <OcWalletButton
        address="bc1qtest"
        message="msg"
        onSigned={() => {}}
        layout="row"
      />,
    );
    expect(css(option("UniSat"), "border-radius")).toBe("9999px");
  });

  it("the paste panel, with a 16px field on a phone", async () => {
    await render(button);
    await click(option("Paste"));
    const field = host.querySelector("textarea");
    // 12px from 768px up, 16px below: the field iOS would otherwise zoom into.
    expect(css(field, "font-size")).toBe(
      "clamp(12px, calc((768px - 100vw) * 1000), 16px)",
    );
    expect(css(field, "border-radius")).toBe("6px");

    const copy = option("Copy");
    expect(css(copy, "border-radius")).toBe("4px");
    expect(css(copy, "text-transform")).toBe("uppercase");

    const back = option("Back");
    expect(back?.textContent).toBe("← Back");
    // The family look wrote "← back"; lowercase keeps it.
    expect(css(back, "text-transform")).toBe("lowercase");
    expect(css(back, "border-radius")).toBe("6px");
    const submit = option("Use signature");
    expect(css(submit, "font-weight")).toBe("600");
    expect(css(submit, "min-height")).toBe("auto");
  });

  it("the empty notes keep their lowercase start", async () => {
    delete win().unisat;
    await render(
      <>
        <OcWalletPicker
          value={null}
          onChange={() => {}}
          showManual={false}
          label="Wallet"
        />
        <OcWalletButton
          address="bc1qtest"
          message="msg"
          onSigned={() => {}}
          showManual={false}
          hideUninstalled
        />
      </>,
    );
    const pickerNote = byText("No browser wallet detected");
    expect(css(pickerNote, "text-transform")).toBe("lowercase");
    const buttonNote = byText("No");
    expect(css(buttonNote, "text-transform")).toBe("lowercase");
    const marks = Array.from(host.querySelectorAll("[aria-hidden]")).filter((m) =>
      ["§ ", "// "].includes(m.textContent ?? ""),
    );
    expect(marks.map((m) => m.textContent)).toEqual(["§ ", "// ", "§ ", "// "]);
  });
});

describe("variables: app-design's values take over", () => {
  const vars = appDesignVars();

  it("app-design sets the variables this package reads", () => {
    expect(Object.keys(vars).sort()).toEqual(
      [
        "--oc-wallet-button-radius",
        "--oc-wallet-case",
        "--oc-wallet-field-size",
        "--oc-wallet-font",
        "--oc-wallet-mark",
        "--oc-wallet-min-height",
        "--oc-wallet-radius",
        "--oc-wallet-ready",
        "--oc-wallet-scale",
        "--oc-wallet-strong",
        "--oc-wallet-surface",
        "--oc-wallet-tracking",
      ].sort(),
    );
  });

  it("every one is read, and none other", async () => {
    await render(
      <>
        <OcWalletPicker value={null} onChange={() => {}} label="Wallet" />
        {button}
      </>,
    );
    await click(option("Paste", inButton()));
    const read = new Set<string>();
    for (const el of Array.from(host.querySelectorAll("[style]"))) {
      for (const m of el.getAttribute("style")!.matchAll(/--oc-wallet-[\w-]+/g))
        read.add(m[0]);
    }
    expect([...read].sort()).toEqual(Object.keys(vars).sort());
  });

  it("type, shape and marks follow the design", async () => {
    await render(button);
    expect(css(host.firstElementChild, "font-family", vars)).toBe(
      "var(--oc-font-sans)",
    );
    const heading = host.querySelector("[data-oc-wallet-button-heading]");
    expect(css(heading, "text-transform", vars)).toBe("none");
    expect(css(heading, "letter-spacing", vars)).toBe("0");
    expect(css(heading, "font-size", vars)).toBe("calc(10px * 1.25)");
    expect(css(heading, "font-weight", vars)).toBe("500");
    expect(css(heading?.querySelector("[aria-hidden]"), "display", vars)).toBe(
      "none",
    );
    const row = option("UniSat");
    expect(css(row, "border-radius", vars)).toBe("0.875rem");
    expect(css(row, "min-height", vars)).toBe("2.25rem");
    expect(css(row, "background", vars)).toBe("var(--card)");
    expect(css(row?.firstElementChild, "color", vars)).toBe("var(--success)");

    await click(option("Paste"));
    expect(css(host.querySelector("textarea"), "font-size", vars)).toBe(
      "1rem",
    );
    expect(css(option("Back"), "border-radius", vars)).toBe("9999px");
    expect(css(option("Back"), "text-transform", vars)).toBe("none");
  });

  it("copy is sentence case, so case none reads it as written", async () => {
    await render(button);
    const statuses = buttons().map((b) => b.lastElementChild?.textContent);
    expect(statuses).toContain("Ready");
    expect(statuses).toContain("Install");
    expect(statuses).toContain("Paste");

    await click(option("UniSat"));
    expect(option("UniSat")?.lastElementChild?.textContent).toBe("Signing…");
    expect(option("Cancel pending sign")).toBeTruthy();
  });
});

describe("no style escapes the variables", () => {
  it("every size, case, radius and font in every state reads one", async () => {
    await render(
      <>
        <OcWalletPicker value="unisat" onChange={() => {}} label="Wallet" />
        <OcWalletPicker
          value={null}
          onChange={() => {}}
          label="Wallet"
          layout="list"
        />
        {button}
      </>,
    );
    await click(option("Paste", inButton()));
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[style]"))) {
      for (const prop of [
        "font-size",
        "text-transform",
        "letter-spacing",
        "border-radius",
        "font-weight",
        "min-height",
      ]) {
        const v = el.style.getPropertyValue(prop);
        if (v) expect(v, `${prop} on ${el.outerHTML.slice(0, 80)}`).toMatch(/--oc-wallet-/);
      }
      const family = el.style.getPropertyValue("font-family");
      if (family) expect(family).toMatch(/^(inherit|var\(--oc-wallet-font,)/);
      // jsdom writes a bare #22c55e as rgb(34, 197, 94).
      expect(el.style.getPropertyValue("color")).not.toMatch(
        /^(#22c55e|rgb\(34, 197, 94\))$/,
      );
    }
  });
});
