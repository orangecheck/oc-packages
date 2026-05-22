import type { Meta, StoryObj } from '@storybook/react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
    title: 'Primitives/Alert',
    component: Alert,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
    render: () => (
        <div className="max-w-xl space-y-4">
            <Alert>
                <Info />
                <AlertTitle>heads up</AlertTitle>
                <AlertDescription>your stamp anchors at the next OTS aggregation.</AlertDescription>
            </Alert>
            <Alert variant="success">
                <CheckCircle2 />
                <AlertTitle>verified</AlertTitle>
                <AlertDescription>signature + timestamp both check out.</AlertDescription>
            </Alert>
            <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>not yet anchored</AlertTitle>
                <AlertDescription>this stamp is pending its first Bitcoin confirmation.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
                <XCircle />
                <AlertTitle>verification failed</AlertTitle>
                <AlertDescription>the signature does not match the claimed address.</AlertDescription>
            </Alert>
        </div>
    ),
};
