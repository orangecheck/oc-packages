'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QrCodeProps {
    /** String to encode — Lightning invoices, BTC addresses, BIP-21 URIs all work. */
    value: string;
    /** Pixel size of the rendered SVG. Default 200. */
    size?: number;
    /** Accessible label for screen readers. */
    label?: string;
    className?: string;
}

/**
 * Client-side QR renderer (inline SVG via the `qrcode` package — no canvas, no
 * data-URI). Renders nothing during SSR; encodes on mount. Wrapped in role="img"
 * with the supplied label. White quiet-zone background for reliable scanning in
 * any theme/mode.
 */
export function QrCode({ value, size = 200, label, className }: QrCodeProps) {
    const [svg, setSvg] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        QRCode.toString(value, {
            type: 'svg',
            errorCorrectionLevel: 'M',
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
        })
            .then((out) => {
                if (!cancelled) setSvg(out);
            })
            .catch(() => {
                if (!cancelled) setSvg(null);
            });
        return () => {
            cancelled = true;
        };
    }, [value]);

    return (
        <div
            role="img"
            aria-label={label ?? `QR code for ${value.slice(0, 24)}…`}
            className={'inline-block overflow-hidden rounded-md bg-white p-3 ' + (className ?? '')}
            style={{ width: size, height: size }}
        >
            {svg ? (
                <div
                    className="size-full [&_svg]:block [&_svg]:size-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            ) : (
                <div className="bg-muted/40 size-full animate-pulse rounded" aria-hidden />
            )}
        </div>
    );
}
