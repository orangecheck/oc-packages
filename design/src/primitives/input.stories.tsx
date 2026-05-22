import type { Meta, StoryObj } from '@storybook/react';

import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';

const meta = {
    title: 'Primitives/Form',
    component: Input,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
    render: () => (
        <div className="max-w-sm space-y-2">
            <Label htmlFor="addr">bitcoin address</Label>
            <Input id="addr" placeholder="bc1q…" />
        </div>
    ),
};

export const States: Story = {
    render: () => (
        <div className="max-w-sm space-y-4">
            <div className="space-y-2">
                <Label htmlFor="a">default</Label>
                <Input id="a" placeholder="type here" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="b">disabled</Label>
                <Input id="b" placeholder="disabled" disabled />
            </div>
            <div className="space-y-2">
                <Label htmlFor="c">invalid</Label>
                <Input id="c" defaultValue="not-an-address" aria-invalid />
            </div>
        </div>
    ),
};

export const TextareaField: Story = {
    name: 'Textarea',
    render: () => (
        <div className="max-w-md space-y-2">
            <Label htmlFor="msg">message to sign</Label>
            <Textarea id="msg" rows={5} defaultValue={'{\n  "v": 1,\n  "kind": "stamp"\n}'} />
        </div>
    ),
};

export const FullForm: Story = {
    name: 'Full form',
    render: () => (
        <form className="max-w-md space-y-4">
            <div className="space-y-2">
                <Label htmlFor="f-addr">address</Label>
                <Input id="f-addr" placeholder="bc1q…" />
            </div>
            <div className="space-y-2">
                <Label htmlFor="f-note">note</Label>
                <Textarea id="f-note" rows={3} placeholder="optional context" />
            </div>
        </form>
    ),
};
