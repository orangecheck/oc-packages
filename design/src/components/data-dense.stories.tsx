import type { Meta, StoryObj } from '@storybook/react';
import { DataRow, DefinitionList, Panel, StatCard, StatGrid } from '../composites';
import { Button, StatusPill } from '../primitives';

const meta = {
    title: 'Composites/DataDense',
    parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const STATS = [
    { label: 'attestations', value: '12,418', accent: true },
    { label: 'participants', value: '3,902' },
    { label: 'declared bonds', value: '₿ 1.84' },
    { label: 'relays', value: '7' },
];

/** Renders every data-dense component. Flip the skin in the toolbar: sharp/flat
 *  terminal under the cypherpunk skins, soft/warm cards under ember. */
export const Showcase: Story = {
    render: () => (
        <div className="mx-auto max-w-3xl space-y-2">
            <StatGrid columns={4} items={STATS} />

            <div className="grid gap-2 sm:grid-cols-2">
                <StatCard label="uptime" value="99.98%" sub="last 90 days" />
                <StatCard label="median anchor" value="11 min" tone="success" />
            </div>

            <Panel
                flush
                label="participants"
                title="Who is attesting"
                action={<Button variant="outline" size="sm">refresh</Button>}
            >
                <ul className="oc-data-list divide-y border">
                    <DataRow as="li" meta="2 min ago">
                        <span className="font-medium">bc1q…k8wadj8</span>
                    </DataRow>
                    <DataRow as="li" meta="14 min ago" action={<StatusPill label="live" tone="success" variant="bordered" />}>
                        <span className="font-medium">bc1p…ezn4q</span>
                    </DataRow>
                    <DataRow as="li" meta="1 h ago">
                        <span className="font-medium">bc1q…7m2t0</span>
                    </DataRow>
                </ul>
            </Panel>

            <Panel label="service" title="Endpoint detail">
                <DefinitionList
                    items={[
                        { label: 'environment', value: 'production' },
                        { label: 'version', value: 'v1.4.2' },
                        { label: 'discovery relay', value: 'wss://relay.ochk.io' },
                        { label: 'last anchor', value: '00000000000000000002a7c…f31b' },
                    ]}
                />
            </Panel>

            <Panel label="bonds" title="Declared bonds">
                <table className="oc-data-table w-full border text-sm">
                    <thead>
                        <tr className="text-left">
                            <th className="px-3 py-2">address</th>
                            <th className="px-3 py-2">amount</th>
                            <th className="px-3 py-2">age</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y border-t">
                        <tr>
                            <td className="px-3 py-2">bc1q…k8wadj8</td>
                            <td className="px-3 py-2">₿ 0.50</td>
                            <td className="px-3 py-2">214 d</td>
                        </tr>
                        <tr>
                            <td className="px-3 py-2">bc1p…ezn4q</td>
                            <td className="px-3 py-2">₿ 1.20</td>
                            <td className="px-3 py-2">88 d</td>
                        </tr>
                    </tbody>
                </table>
            </Panel>
        </div>
    ),
};
