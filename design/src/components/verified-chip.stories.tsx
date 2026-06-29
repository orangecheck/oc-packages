import type { Meta, StoryObj } from '@storybook/react';
import { ShieldCheck } from 'lucide-react';
import { VerifiedChip } from '../composites';

const meta = {
    title: 'Composites/VerifiedChip',
    component: VerifiedChip,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof VerifiedChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <VerifiedChip label="verified on bitcoin" />,
};

export const Tones: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-4">
            <VerifiedChip iconTone="peach" label="verified on bitcoin" />
            <VerifiedChip iconTone="brand" label="stake confirmed" />
            <VerifiedChip iconTone="dark" icon={<ShieldCheck />} label="offline-checked" />
        </div>
    ),
};

export const OverHero: Story = {
    render: () => (
        <div className="bg-brand relative flex h-48 items-center justify-center rounded-xl">
            <VerifiedChip label="verified on bitcoin" className="absolute bottom-4 right-4" />
        </div>
    ),
};
