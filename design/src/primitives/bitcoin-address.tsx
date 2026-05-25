import { cn } from '../tokens/cn';
import { shortenAddress } from '../format';
import { CopyButton } from './copy-button';

export interface BitcoinAddressProps {
    /** The full address (or any long id — Lightning, npub, did). */
    address: string;
    head?: number;
    tail?: number;
    /** Show a copy button that copies the FULL address. Default true. */
    copyable?: boolean;
    /** Render the full value untruncated. */
    full?: boolean;
    className?: string;
}

/**
 * Canonical truncated address display: monospace, `bc1qxy…wxyz`, with a copy
 * button that copies the full value. Replaces the per-site inline truncate+copy
 * patterns (IdentityChip, wallet panels, admin lists).
 */
export function BitcoinAddress({
    address,
    head = 8,
    tail = 4,
    copyable = true,
    full = false,
    className,
}: BitcoinAddressProps) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs', className)}>
            <span title={address}>{full ? address : shortenAddress(address, head, tail)}</span>
            {copyable && <CopyButton value={address} size="sm" title="copy address" />}
        </span>
    );
}
