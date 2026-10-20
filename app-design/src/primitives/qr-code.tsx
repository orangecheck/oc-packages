import QRCode from 'qrcode';
import { useMemo } from 'react';

import { cn } from '../lib/cn';

/**
 * A QR code for an address, an invoice or a link: ink modules on a white
 * tile in both modes, since a scanner needs dark on light. Drawn as one SVG
 * path at render, so it is there in the server's HTML with no flash, and it
 * is an image with a name for a screen reader.
 */
export function QrCode({
    value,
    size = 200,
    label,
    className,
}: {
    /** What it encodes: a BIP-21 URI, a Lightning invoice, an address, a link. */
    value: string;
    /** Rendered width and height in px, the white margin included. */
    size?: number;
    /** What a screen reader hears. Defaults to "QR code for" and the value's start. */
    label?: string;
    className?: string;
}) {
    const matrix = useMemo(() => {
        try {
            return QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
        } catch {
            return null;
        }
    }, [value]);
    const path = useMemo(() => {
        if (!matrix) return '';
        let d = '';
        for (let y = 0; y < matrix.size; y++) {
            for (let x = 0; x < matrix.size; x++) {
                if (matrix.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
            }
        }
        return d;
    }, [matrix]);
    const short = value.length > 28 ? `${value.slice(0, 28)}…` : value;
    return (
        <div
            role="img"
            aria-label={matrix ? (label ?? `QR code for ${short}`) : 'Too long for a QR code'}
            className={cn('inline-block shrink-0 rounded-2xl bg-white p-3 ring-1 ring-border', className)}
            style={{ width: size, height: size }}
        >
            {matrix ? (
                <svg viewBox={`0 0 ${matrix.size} ${matrix.size}`} shapeRendering="crispEdges" aria-hidden className="block size-full">
                    <path d={path} fill="#0a0a0a" />
                </svg>
            ) : (
                <div aria-hidden className="flex size-full items-center justify-center text-center text-[0.8125rem] text-[#54585e]">
                    Too long for a QR code
                </div>
            )}
        </div>
    );
}
