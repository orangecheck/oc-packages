import type { Meta, StoryObj } from '@storybook/react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
    title: 'Primitives/Tabs',
    component: Tabs,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <Tabs defaultValue="curl">
                <TabsList>
                    <TabsTrigger value="curl">curl</TabsTrigger>
                    <TabsTrigger value="node">node</TabsTrigger>
                    <TabsTrigger value="python">python</TabsTrigger>
                </TabsList>
                <TabsContent value="curl">
                    <pre className="bg-muted/40 border p-4 font-mono text-xs">
                        curl -s https://api.ochk.io/v1/verify
                    </pre>
                </TabsContent>
                <TabsContent value="node">
                    <pre className="bg-muted/40 border p-4 font-mono text-xs">
                        await oc.verify(envelope)
                    </pre>
                </TabsContent>
                <TabsContent value="python">
                    <pre className="bg-muted/40 border p-4 font-mono text-xs">
                        oc.verify(envelope)
                    </pre>
                </TabsContent>
            </Tabs>
        </div>
    ),
};
