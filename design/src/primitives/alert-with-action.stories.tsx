import type { Meta, StoryObj } from '@storybook/react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { AlertWithAction, AlertWithCountdown } from './alert-with-action';

const meta = {
    title: 'Primitives/AlertWithAction',
    component: AlertWithAction,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof AlertWithAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
    render: () => (
        <div className="max-w-xl space-y-4">
            <AlertWithAction
                variant="warning"
                icon={AlertTriangle}
                title="pending transaction"
                description="this address has unconfirmed transactions."
                actionLabel="retry"
                actionIcon={<RefreshCw className="size-3.5" />}
                onAction={() => undefined}
            />
        </div>
    ),
};

export const WithCountdown: Story = {
    render: () => (
        <div className="max-w-xl space-y-4">
            <AlertWithCountdown
                variant="default"
                icon={AlertTriangle}
                title="rechecking"
                description="we'll re-verify the proof shortly."
                countdown={30}
                actionIcon={<RefreshCw className="size-3.5" />}
                onAction={() => undefined}
            />
        </div>
    ),
};
