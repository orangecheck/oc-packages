import type { Meta, StoryObj } from '@storybook/react';

import { BitcoinAddress } from './bitcoin-address';
import { CopyButton } from './copy-button';
import { QrCode } from './qr-code';
import { SatsAmount } from './sats-amount';
import {
    explorerUrl,
    formatSats,
    formatSatsCompact,
    priceBoth,
    relativeTime,
    satsToUsd,
    shortenAddress,
} from '../format';

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';

const meta = { title: 'Bitcoin/Primitives', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj;

export const SatsAmounts: Story = {
    name: 'SatsAmount',
    render: () => (
        <div className="space-y-2 font-mono text-sm">
            <div>
                <SatsAmount sats={7000} />
            </div>
            <div>
                <SatsAmount sats={210000} usd />
            </div>
            <div>
                <SatsAmount sats={2_100_000} usd /> <span className="text-muted-foreground">· lifetime</span>
            </div>
        </div>
    ),
};

export const Address: Story = {
    name: 'BitcoinAddress',
    render: () => (
        <div className="space-y-3">
            <BitcoinAddress address={ADDR} />
            <BitcoinAddress address={ADDR} head={6} tail={6} />
            <BitcoinAddress address={ADDR} full />
        </div>
    ),
};

export const Copy: Story = {
    name: 'CopyButton',
    render: () => (
        <div className="flex items-center gap-6">
            <CopyButton value={ADDR} />
            <CopyButton value={ADDR} label="copy address" />
            <CopyButton value="s3cr3t-passphrase" label="copy secret" clearAfter={15} />
        </div>
    ),
};

export const Qr: Story = {
    name: 'QrCode',
    render: () => <QrCode value={`bitcoin:${ADDR}`} size={180} label="receive address" />,
};

export const Format: Story = {
    name: 'format utilities',
    render: () => (
        <div className="docs-prose max-w-xl">
            <table>
                <tbody>
                    <tr><td>formatSats(2100000)</td><td><code>{formatSats(2_100_000)}</code></td></tr>
                    <tr><td>formatSatsCompact(70000)</td><td><code>{formatSatsCompact(70_000)}</code></td></tr>
                    <tr><td>satsToUsd(210000)</td><td><code>{satsToUsd(210_000)}</code></td></tr>
                    <tr><td>priceBoth(7000)</td><td><code>{priceBoth(7_000)}</code></td></tr>
                    <tr><td>relativeTime(now-3h)</td><td><code>{relativeTime(Date.now() - 3 * 3600_000)}</code></td></tr>
                    <tr><td>shortenAddress(addr)</td><td><code>{shortenAddress(ADDR)}</code></td></tr>
                    <tr><td>explorerUrl({'{address}'})</td><td><code>{explorerUrl({ address: ADDR })}</code></td></tr>
                </tbody>
            </table>
        </div>
    ),
};
