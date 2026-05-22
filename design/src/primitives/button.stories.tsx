import type { Meta, StoryObj } from '@storybook/react';
import { ArrowRight, Check } from 'lucide-react';

import { Button, buttonVariants } from './button';

const VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const;
const SIZES = ['sm', 'default', 'lg', 'icon'] as const;

const meta = {
    title: 'Primitives/Button',
    component: Button,
    parameters: { layout: 'padded' },
    argTypes: {
        variant: { control: 'select', options: VARIANTS },
        size: { control: 'select', options: SIZES },
    },
    args: { children: 'sign a stamp', variant: 'default', size: 'default' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            {VARIANTS.map((v) => (
                <Button key={v} variant={v}>
                    {v}
                </Button>
            ))}
        </div>
    ),
};

export const Sizes: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">small</Button>
            <Button size="default">default</Button>
            <Button size="lg">large</Button>
            <Button size="icon" aria-label="confirm">
                <Check />
            </Button>
        </div>
    ),
};

export const WithIcon: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            <Button>
                <Check /> verified
            </Button>
            <Button variant="outline">
                continue <ArrowRight />
            </Button>
        </div>
    ),
};

export const States: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            <Button>enabled</Button>
            <Button disabled>disabled</Button>
            <Button aria-invalid>invalid</Button>
        </div>
    ),
};

export const AsChildLink: Story = {
    name: 'asChild (link)',
    render: () => (
        <a className={buttonVariants({ variant: 'default' })} href="https://design.ochk.io">
            rendered as an anchor
        </a>
    ),
};
