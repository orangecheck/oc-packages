import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Button } from './button';
import { ConfirmHost, confirm } from './confirm-dialog';

const meta = {
    title: 'Primitives/ConfirmDialog',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <>
                <Story />
                <ConfirmHost />
            </>
        ),
    ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const PromiseBased: Story = {
    name: 'Promise-based confirm()',
    render: () => {
        function Demo() {
            const [result, setResult] = useState<string>('—');
            return (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={async () => {
                                const ok = await confirm({
                                    title: 'delete stamp',
                                    message: 'This cannot be undone. The Nostr event stays, but your local copy is removed.',
                                    confirmLabel: 'delete',
                                    destructive: true,
                                });
                                setResult(ok ? 'confirmed' : 'cancelled');
                            }}
                            variant="destructive"
                        >
                            delete (destructive)
                        </Button>
                        <Button
                            variant="outline"
                            onClick={async () => {
                                const ok = await confirm({
                                    title: 'publish to relays',
                                    message: 'Broadcast this stamp to 4 Nostr relays?',
                                });
                                setResult(ok ? 'confirmed' : 'cancelled');
                            }}
                        >
                            publish (default)
                        </Button>
                    </div>
                    <p className="text-muted-foreground font-mono text-xs">
                        {'>'} last result: {result}
                    </p>
                </div>
            );
        }
        return <Demo />;
    },
};
