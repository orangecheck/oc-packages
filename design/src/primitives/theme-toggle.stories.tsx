import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider } from 'next-themes';

import { ThemeToggle, ThemeToggleLink } from './theme-toggle';

const meta = {
    title: 'Primitives/Theme Toggle (mode)',
    component: ThemeToggle,
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                <Story />
            </ThemeProvider>
        ),
    ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButton: Story = {
    render: () => (
        <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">light / dark mode →</span>
            <ThemeToggle />
        </div>
    ),
};

export const DrawerLink: Story = {
    name: 'Drawer link variant',
    render: () => (
        <div className="bg-card w-56 rounded-md border p-2">
            <ThemeToggleLink />
        </div>
    ),
};
