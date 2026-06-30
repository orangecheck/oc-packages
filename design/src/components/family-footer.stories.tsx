import type { Meta, StoryObj } from "@storybook/react";

import { OcFamilyFooter } from "../chrome";

const meta = {
  title: "Chrome/OcFamilyFooter",
  component: OcFamilyFooter,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OcFamilyFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A protocol/product site: own columns + the shared brand/legal skeleton. */
export const Stamp: Story = {
  render: () => (
    <OcFamilyFooter
      brand={{
        wordmark: "oc·stamp",
        tagline:
          "Bitcoin-identity-bound content attestation, anchored to Bitcoin.",
        meta: (
          <span className="text-muted-foreground/60 font-mono text-[11px] tracking-widest uppercase">
            mit · composes with opentimestamps
          </span>
        ),
      }}
      columns={[
        {
          label: "§ product",
          links: [
            { href: "/create", label: "create a stamp" },
            { href: "/verify", label: "verify a stamp" },
          ],
        },
        {
          label: "§ docs",
          links: [
            {
              href: "https://docs.ochk.io/stamp",
              label: "overview",
              external: true,
            },
            {
              href: "https://docs.ochk.io/stamp/spec",
              label: "spec",
              external: true,
            },
          ],
        },
        {
          label: "§ source",
          links: [
            {
              href: "https://github.com/orangecheck/oc-stamp-protocol",
              label: "oc-stamp-protocol",
              external: true,
            },
          ],
        },
      ]}
    />
  ),
};

/** The hub (ochk.io): registry-driven family columns, all products + protocols. */
export const Hub: Story = {
  render: () => (
    <OcFamilyFooter
      family="both"
      brand={{
        wordmark: (
          <span>
            orangecheck<sup className="text-[8px]">™</sup>
          </span>
        ),
        tagline:
          "The protocol surface of the sovereign web. Composable protocols on Bitcoin — no custody, no token, no issuer.",
      }}
      columns={[
        {
          label: "§ docs",
          links: [
            { href: "https://docs.ochk.io", label: "overview", external: true },
            {
              href: "https://docs.ochk.io/sdks",
              label: "sdks",
              external: true,
            },
          ],
        },
        {
          label: "§ about",
          links: [
            { href: "/about", label: "about" },
            { href: "/security", label: "security" },
          ],
        },
      ]}
    />
  ),
};

/** Just the family products surfaced beneath a site's own column. */
export const WithFamilyProducts: Story = {
  render: () => (
    <OcFamilyFooter
      family="products"
      brand={{
        wordmark: "oc·chat",
        tagline: "Private messaging where your identity is your inbox.",
      }}
      columns={[
        {
          label: "§ product",
          links: [
            { href: "/app", label: "open oc chat" },
            { href: "/signin", label: "sign in" },
          ],
        },
      ]}
    />
  ),
};
