import type { Meta, StoryObj } from '@storybook/react';
import { OcAccountMenuView, type OcAccountMenuSession } from '../chrome';

const meta = {
    title: 'Composites/AccountMenu',
    component: OcAccountMenuView,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof OcAccountMenuView>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => undefined;

const anonymous: OcAccountMenuSession = {
    status: 'anonymous',
    account: null,
    signOut: noop,
    refresh: noop,
    setDisplayIdentity: noop,
};

const authenticated: OcAccountMenuSession = {
    status: 'authenticated',
    account: {
        didOc: 'did:oc:bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8',
        displayName: 'satoshi',
        displayIdentity: { kind: 'btc', value: 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8' },
        nostrNpub: 'npub1examplexamplexamplexamplexamplexamplexample',
    },
    signOut: noop,
    refresh: noop,
    setDisplayIdentity: noop,
};

export const Anonymous: Story = {
    render: () => (
        <div className="bg-background flex h-72 justify-end">
            <OcAccountMenuView current="stamp" session={anonymous} />
        </div>
    ),
};

export const Authenticated: Story = {
    render: () => (
        <div className="bg-background flex h-96 justify-end">
            <OcAccountMenuView
                current="stamp"
                session={authenticated}
                build={{ version: '1.4.0', sha: 'abc1234', repo: 'orangecheck/oc-stamp-web' }}
                menuItems={[{ href: '/dashboard', label: 'dashboard' }]}
            />
        </div>
    ),
};
