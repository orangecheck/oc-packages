import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from './sheet';

const meta = {
    title: 'Primitives/Sheet',
    component: Sheet,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ side }: { side: 'left' | 'right' | 'top' | 'bottom' }) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline">open {side} sheet</Button>
            </SheetTrigger>
            <SheetContent side={side}>
                <SheetHeader>
                    <SheetTitle>device keys</SheetTitle>
                    <SheetDescription>
                        Your signing keys never leave this device. This panel slides from the{' '}
                        {side}.
                    </SheetDescription>
                </SheetHeader>
                <div className="text-muted-foreground p-4 font-mono text-xs">
                    {'>'} 3 keys · last used 2m ago
                </div>
            </SheetContent>
        </Sheet>
    );
}

export const Sides: Story = {
    render: () => (
        <div className="flex flex-wrap gap-3">
            <Demo side="right" />
            <Demo side="left" />
            <Demo side="top" />
            <Demo side="bottom" />
        </div>
    ),
};
