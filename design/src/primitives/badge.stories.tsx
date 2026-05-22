import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from './badge';

const VARIANTS = [
    'default',
    'secondary',
    'outline',
    'destructive',
    'warning',
    'success',
    'info',
] as const;

const meta = {
    title: 'Primitives/Badge',
    component: Badge,
    parameters: { layout: 'padded' },
    argTypes: { variant: { control: 'select', options: VARIANTS } },
    args: { children: 'live', variant: 'default' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-2">
            {VARIANTS.map((v) => (
                <Badge key={v} variant={v}>
                    {v}
                </Badge>
            ))}
        </div>
    ),
};
