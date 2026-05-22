import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Button } from './button';
import { Modal } from './modal';
import { StatGrid } from '@orangecheck/ui';

const meta = {
    title: 'Primitives/Modal',
    component: Modal,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fullscreenish: Story = {
    render: () => {
        function Demo() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <Button onClick={() => setOpen(true)}>expand cockpit panel</Button>
                    <Modal open={open} onOpenChange={setOpen} title="relay health" subtitle="last 24h">
                        <StatGrid
                            columns={4}
                            items={[
                                { label: 'events', value: '1.2M' },
                                { label: 'connections', value: '318', tone: 'success' },
                                { label: 'errors', value: '2', tone: 'warning' },
                                { label: 'uptime', value: '99.98%', tone: 'success', accent: true },
                            ]}
                        />
                    </Modal>
                </>
            );
        }
        return <Demo />;
    },
};
