import type { Meta, StoryObj } from '@storybook/react';
import { OcPrimaryNav } from '../chrome';

const meta = {
    title: 'Chrome/PrimaryNav',
    component: OcPrimaryNav,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof OcPrimaryNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="bg-background border-y py-2">
            <OcPrimaryNav
                activePath="/dashboard"
                links={[
                    { href: '/dashboard', label: 'dashboard' },
                    { href: '/create', label: 'create' },
                    { href: '/verify', label: 'verify' },
                    { href: 'https://docs.ochk.io/stamp', label: 'docs', external: true },
                    { href: 'https://github.com/orangecheck', label: 'spec', external: true },
                ]}
            />
        </div>
    ),
};
