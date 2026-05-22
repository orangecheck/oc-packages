import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Button } from './button';
import { ErrorBoundary } from './error-boundary';

const meta = {
    title: 'Primitives/ErrorBoundary',
    component: ErrorBoundary,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

function Bomb(): React.ReactElement {
    throw new Error('demo: a child component threw during render');
}

/**
 * Initial render is clean; click to throw inside the boundary and see the
 * house-style "fatal" fallback (terminal chrome + retry).
 */
export const CatchesErrors: Story = {
    render: () => {
        function Demo() {
            const [boom, setBoom] = useState(false);
            return (
                <div className="max-w-xl space-y-3">
                    <Button variant="destructive" onClick={() => setBoom(true)}>
                        trigger a render error
                    </Button>
                    <ErrorBoundary>
                        {boom ? (
                            <Bomb />
                        ) : (
                            <p className="text-muted-foreground text-sm">
                                no error yet — click the button to throw inside the boundary.
                            </p>
                        )}
                    </ErrorBoundary>
                </div>
            );
        }
        return <Demo />;
    },
};

/** Custom fallback via the render-prop (click to throw). */
export const CustomFallback: Story = {
    render: () => {
        function Demo() {
            const [boom, setBoom] = useState(false);
            return (
                <div className="max-w-xl space-y-3">
                    <Button variant="destructive" onClick={() => setBoom(true)}>
                        trigger a render error
                    </Button>
                    <ErrorBoundary
                        fallback={(error, reset) => (
                            <div className="bg-card rounded-md border p-4">
                                <p className="text-destructive font-mono text-xs">
                                    caught: {error.message}
                                </p>
                                <Button size="sm" variant="outline" className="mt-2" onClick={reset}>
                                    reset
                                </Button>
                            </div>
                        )}
                    >
                        {boom ? <Bomb /> : <p className="text-muted-foreground text-sm">ok</p>}
                    </ErrorBoundary>
                </div>
            );
        }
        return <Demo />;
    },
};
