import type { Meta, StoryObj } from '@storybook/react';

import { Separator } from './separator';

const meta = {
    title: 'Primitives/Separator',
    component: Separator,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HorizontalAndVertical: Story = {
    render: () => (
        <div className="max-w-sm">
            <div className="space-y-1">
                <p className="text-sm font-medium">oc · stamp</p>
                <p className="text-muted-foreground text-sm">Bitcoin-anchored provenance</p>
            </div>
            <Separator className="my-4" />
            <div className="flex h-5 items-center gap-3 text-sm">
                <span>create</span>
                <Separator orientation="vertical" />
                <span>verify</span>
                <Separator orientation="vertical" />
                <span>history</span>
            </div>
        </div>
    ),
};
