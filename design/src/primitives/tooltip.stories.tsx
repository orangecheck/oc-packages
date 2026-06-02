import type { Meta, StoryObj } from '@storybook/react';
import { ChevronDown, CornerDownLeft } from 'lucide-react';

import { Button } from './button';
import { Tooltip } from './tooltip';

/**
 * `Tooltip` — themed hover/focus tooltip. Hover with a mouse (300ms intent) or
 * tab to the trigger; it never appears on touch. Try the Skin/Mode toolbar —
 * it re-skins from tokens. (Storybook is desktop, so hover works here.)
 */
const meta = {
    title: 'Primitives/Tooltip',
    component: Tooltip,
    parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Tooltip content={<span className="font-mono text-[11px]">hover or focus the trigger</span>}>
            <Button variant="outline">hover me</Button>
        </Tooltip>
    ),
};

export const Sides: Story = {
    render: () => (
        <div className="flex items-center gap-10 p-16">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <Tooltip
                    key={side}
                    side={side}
                    align="center"
                    content={<span className="font-mono text-[11px]">side: {side}</span>}
                >
                    <Button variant="outline">{side}</Button>
                </Tooltip>
            ))}
        </div>
    ),
};

/**
 * The richer card shape `OcLogoDropdown` uses — multiple rows, mono micro-labels,
 * a primary accent, a full-bleed hairline divider.
 */
export const RichContent: Story = {
    render: () => (
        <Tooltip
            content={
                <div className="w-[13rem]">
                    <div className="flex flex-col leading-tight">
                        <span className="flex flex-wrap items-baseline gap-x-1.5">
                            <span className="text-muted-foreground font-mono text-[9px] tracking-widest uppercase">
                                you’re on
                            </span>
                            <span className="text-primary font-display text-[12px] font-semibold tracking-tight">
                                oc·vault
                            </span>
                        </span>
                        <span className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wide">
                            keep — encrypted secrets
                        </span>
                    </div>
                    <div className="border-border -mx-2.5 my-2 border-t" />
                    <div className="flex items-center gap-1.5">
                        <ChevronDown aria-hidden className="text-muted-foreground h-3 w-3 shrink-0" />
                        <span className="text-primary font-mono text-[10px] font-medium tracking-widest uppercase">
                            click
                        </span>
                        <span className="text-muted-foreground font-mono text-[10px]">·</span>
                        <span className="text-muted-foreground font-mono text-[10px] tracking-wide">
                            switch site
                        </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                        <CornerDownLeft
                            aria-hidden
                            className="text-muted-foreground h-3 w-3 shrink-0"
                        />
                        <span className="text-primary font-mono text-[10px] font-medium tracking-widest uppercase">
                            double-click
                        </span>
                        <span className="text-muted-foreground font-mono text-[10px]">·</span>
                        <span className="text-muted-foreground font-mono text-[10px] tracking-wide">
                            home
                        </span>
                    </div>
                </div>
            }
        >
            <Button variant="outline">§ orangecheck</Button>
        </Tooltip>
    ),
};
