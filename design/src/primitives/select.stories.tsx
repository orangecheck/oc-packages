import type { Meta, StoryObj } from '@storybook/react';

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from './select';

const meta = {
    title: 'Primitives/Select',
    component: Select,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Select defaultValue="mainnet">
            <SelectTrigger className="w-56">
                <SelectValue placeholder="select network" />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectLabel>bitcoin</SelectLabel>
                    <SelectItem value="mainnet">mainnet</SelectItem>
                    <SelectItem value="testnet">testnet</SelectItem>
                    <SelectItem value="signet">signet</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
    ),
};
