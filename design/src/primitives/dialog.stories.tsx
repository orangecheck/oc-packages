import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from './dialog';

const meta = {
    title: 'Primitives/Dialog',
    component: Dialog,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Dialog>
            <DialogTrigger asChild>
                <Button>revoke delegation</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>revoke this delegation?</DialogTitle>
                    <DialogDescription>
                        The agent will lose authority immediately. A revocation event is published
                        to Nostr and anchored.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                        <Button variant="destructive">revoke</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    ),
};

export const OpenByDefault: Story = {
    name: 'Open (for review)',
    render: () => (
        <Dialog defaultOpen>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>anchored</DialogTitle>
                    <DialogDescription>
                        This stamp is now confirmed on Bitcoin and verifiable offline forever.
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    ),
};
