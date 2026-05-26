import type { Meta, StoryObj } from '@storybook/react';

import { Checkbox } from './checkbox';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Switch } from './switch';

const meta = {
    title: 'Primitives/Controls',
    parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Checkboxes: Story = {
    name: 'Checkbox',
    render: () => (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Checkbox id="c1" defaultChecked />
                <Label htmlFor="c1">anchor to a Bitcoin block</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="c2" />
                <Label htmlFor="c2">notify on revocation</Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="c3" disabled />
                <Label htmlFor="c3" className="opacity-50">
                    disabled
                </Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox id="c4" aria-invalid defaultChecked />
                <Label htmlFor="c4">invalid (error state)</Label>
            </div>
        </div>
    ),
};

export const Radios: Story = {
    name: 'RadioGroup',
    render: () => (
        <RadioGroup defaultValue="balance" className="space-y-1">
            {[
                ['balance', 'stake weight = balance'],
                ['age', 'stake weight = coin age'],
                ['flat', 'one address, one vote'],
            ].map(([v, label]) => (
                <div key={v} className="flex items-center gap-2">
                    <RadioGroupItem value={v} id={`r-${v}`} />
                    <Label htmlFor={`r-${v}`}>{label}</Label>
                </div>
            ))}
        </RadioGroup>
    ),
};

export const Switches: Story = {
    name: 'Switch',
    render: () => (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Switch id="s1" defaultChecked />
                <Label htmlFor="s1">federation-custodied payouts</Label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="s2" />
                <Label htmlFor="s2">self-custody graduation</Label>
            </div>
            <div className="flex items-center gap-2">
                <Switch id="s3" disabled />
                <Label htmlFor="s3" className="opacity-50">
                    disabled
                </Label>
            </div>
        </div>
    ),
};
