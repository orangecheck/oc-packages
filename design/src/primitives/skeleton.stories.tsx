import type { Meta, StoryObj } from '@storybook/react';

import { Skeleton } from './skeleton';

const meta = {
    title: 'Primitives/Skeleton',
    component: Skeleton,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingCard: Story = {
    render: () => (
        <div className="bg-card max-w-sm space-y-3 rounded-md border p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-9 w-28" />
        </div>
    ),
};
