import type { Meta, StoryObj } from '@storybook/react';
import { EcosystemSwitcher, OcLogoDropdown } from '../chrome';

const meta = {
    title: 'Chrome/Logo & Switcher',
    parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const LogoDropdown: Story = {
    render: () => (
        <div className="bg-background flex h-24 items-start">
            <OcLogoDropdown current="stamp" homeHref="/" siteState="live">
                <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded font-mono text-xs font-bold">
                    §
                </span>
                <span className="font-display text-base font-bold tracking-tight">
                    oc&middot;<span className="text-primary">stamp</span>
                </span>
            </OcLogoDropdown>
        </div>
    ),
};

/**
 * Owner view — `showOwnerEntries` reveals the gated `owner` section
 * (oc·analytics, oc·bot). Consumers drive this from
 * `useOcSession().account?.isOwner`; it's a UX hint, not a security
 * boundary (each owner surface re-checks `OWNER_OC_ADDRESSES` live).
 * Rendered here from `oc·bot`, so its own row shows as `home ✓`.
 */
export const OwnerView: Story = {
    render: () => (
        <div className="bg-background flex h-[28rem] items-start">
            <OcLogoDropdown current="bot" homeHref="/" siteState="alpha" showOwnerEntries>
                <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded font-mono text-xs font-bold">
                    §
                </span>
                <span className="font-display text-base font-bold tracking-tight">
                    oc&middot;<span className="text-primary">bot</span>
                </span>
            </OcLogoDropdown>
        </div>
    ),
};

export const Switcher: Story = {
    render: () => (
        <div className="bg-background flex h-72 items-start">
            <EcosystemSwitcher current="stamp" />
        </div>
    ),
};
