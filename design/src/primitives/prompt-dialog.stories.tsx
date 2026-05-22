import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Button } from './button';
import { PromptHost, prompt } from './prompt-dialog';

const meta = {
    title: 'Primitives/PromptDialog',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <>
                <Story />
                <PromptHost />
            </>
        ),
    ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const PromiseBased: Story = {
    name: 'Promise-based prompt()',
    render: () => {
        function Demo() {
            const [result, setResult] = useState('—');
            return (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={async () => {
                                const v = await prompt({
                                    title: 'name this vault',
                                    label: 'label',
                                    placeholder: 'e.g. cold storage',
                                });
                                setResult(v === null ? 'cancelled' : `"${v}"`);
                            }}
                        >
                            rename
                        </Button>
                        <Button
                            variant="outline"
                            onClick={async () => {
                                const v = await prompt({
                                    title: 'set a passphrase',
                                    label: 'passphrase',
                                    secret: true,
                                    confirmField: true,
                                    minLength: 8,
                                });
                                setResult(v === null ? 'cancelled' : 'set ✓');
                            }}
                        >
                            set passphrase (secret + confirm)
                        </Button>
                    </div>
                    <p className="text-muted-foreground font-mono text-xs">{'>'} result: {result}</p>
                </div>
            );
        }
        return <Demo />;
    },
};
