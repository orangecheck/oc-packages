import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider } from 'next-themes';
import { toast } from 'sonner';

import { Button } from './button';
import { Toaster } from './toaster';

const meta = {
    title: 'Primitives/Toaster',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                <Story />
                <Toaster />
            </ThemeProvider>
        ),
    ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Toasts: Story = {
    render: () => (
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast('stamp created')}>
                default
            </Button>
            <Button variant="outline" onClick={() => toast.success('anchored to bitcoin')}>
                success
            </Button>
            <Button variant="outline" onClick={() => toast.warning('not yet confirmed')}>
                warning
            </Button>
            <Button variant="outline" onClick={() => toast.error('verification failed')}>
                error
            </Button>
        </div>
    ),
};
