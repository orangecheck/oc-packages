'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { cn } from '../tokens/cn';

export interface CopyButtonProps {
    /** Text to copy. */
    value: string;
    /** Optional visible label beside the icon. */
    label?: string;
    /**
     * Auto-wipe the clipboard after N seconds if it still holds `value`
     * (secrets-manager behaviour, à la 1Password). 0/undefined = never wipe.
     */
    clearAfter?: number;
    size?: 'sm' | 'md';
    className?: string;
    title?: string;
    onCopied?: () => void;
}

/**
 * Copy-to-clipboard control with "copied" feedback and optional auto-wipe.
 * Canonical form of the copy buttons scattered across the family (wallet
 * panels, address displays, share sheets, secret reveals).
 */
export function CopyButton({
    value,
    label,
    clearAfter,
    size = 'md',
    className,
    title,
    onCopied,
}: CopyButtonProps) {
    const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const copy = useCallback(async () => {
        let next: 'copied' | 'failed' = 'copied';
        try {
            await navigator.clipboard.writeText(value);
            onCopied?.();
            if (clearAfter && clearAfter > 0) {
                setTimeout(() => void wipeIfUnchanged(value), clearAfter * 1000);
            }
        } catch {
            // Denied or insecure context: say so, so the user knows to select and copy.
            next = 'failed';
        }
        setStatus(next);
        if (resetRef.current) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => setStatus('idle'), next === 'failed' ? 4000 : 1500);
    }, [value, clearAfter, onCopied]);
    const copied = status === 'copied';

    const iconSize = size === 'sm' ? 'size-3' : 'size-3.5';

    return (
        <button
            type="button"
            onClick={copy}
            aria-label={label ? undefined : (title ?? 'copy')}
            title={title ?? 'copy'}
            className={cn(
                'oc-hit text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                size === 'sm' ? 'text-[11px]' : 'text-xs',
                className
            )}
        >
            {copied ? (
                <Check className={cn(iconSize, 'text-success')} aria-hidden />
            ) : (
                <Copy className={iconSize} aria-hidden />
            )}
            {label && (
                <span className="font-mono">{copied ? 'copied' : status === 'failed' ? 'copy failed' : label}</span>
            )}
            <span className="sr-only" aria-live="polite">
                {copied ? 'copied' : status === 'failed' ? 'copy failed, select the text to copy it' : ''}
            </span>
        </button>
    );
}

async function wipeIfUnchanged(expected: string): Promise<void> {
    try {
        const current = await navigator.clipboard.readText();
        if (current !== expected) return;
        await navigator.clipboard.writeText('');
    } catch {
        try {
            await navigator.clipboard.writeText('');
        } catch {
            /* clipboard fully unavailable */
        }
    }
}
