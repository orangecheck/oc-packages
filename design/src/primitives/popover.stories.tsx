import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const meta = {
    title: 'Primitives/Popover',
    component: Popover,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline">details</Button>
            </PopoverTrigger>
            <PopoverContent>
                <div className="space-y-1">
                    <p className="text-sm font-medium">stamp #12408</p>
                    <p className="text-muted-foreground font-mono text-xs">
                        anchored · block 842,109
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    ),
};
