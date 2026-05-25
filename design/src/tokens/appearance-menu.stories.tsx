import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider } from 'next-themes';

import { OcAppearanceMenu } from './appearance-menu';
import { OcThemeProvider } from './provider';

const meta = {
    title: 'Themes/Appearance Menu',
    component: OcAppearanceMenu,
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <OcThemeProvider>
                    <Story />
                </OcThemeProvider>
            </ThemeProvider>
        ),
    ],
} satisfies Meta<typeof OcAppearanceMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The single appearance control every family site uses — one icon, a dropdown
 * with both axes: light/dark/system mode AND the theme/skin choice. Click it;
 * the page recolors and the mode flips, and both choices persist across
 * *.ochk.io.
 */
export const Default: Story = {
    render: () => (
        <div className="flex h-80 flex-col items-end gap-4">
            <OcAppearanceMenu />
            <p className="text-muted-foreground self-start text-sm">
                One control → light/dark/system + every theme. Replaces the separate ThemeToggle +
                OcThemePicker.
            </p>
        </div>
    ),
};
