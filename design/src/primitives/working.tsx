'use client';

import { cn } from '../tokens/cn';

/**
 * Cohesive "working" indicator used at every async hold-point. Two styles, same
 * DNA — a cypherpunk marching-cursor of three dots (no SVG spinner). The CSS
 * lives in `@orangecheck/design/styles.css` (`.oc-working-*`). Each indicator
 * carries an `aria-live="polite"` region announcing the activity.
 */
export interface WorkingProps {
    /** Short verb phrase describing what's happening. Lowercase. */
    text: string;
    /** Compact (button-sized) or normal (inline block). */
    size?: 'sm' | 'md';
    /** Optional — show a progress ratio (e.g. "2 of 4 relays"). */
    progress?: string;
    className?: string;
}

export function Working({ text, size = 'md', progress, className }: WorkingProps) {
    const isSmall = size === 'sm';
    return (
        <span
            aria-live="polite"
            className={cn(
                'inline-flex items-center gap-2 font-mono',
                isSmall ? 'text-[11px]' : 'text-xs',
                'text-muted-foreground',
                className
            )}
        >
            <span className="oc-working-cursor" aria-hidden>
                <span className="oc-working-dot" style={{ animationDelay: '0ms' }}>
                    ·
                </span>
                <span className="oc-working-dot" style={{ animationDelay: '140ms' }}>
                    ·
                </span>
                <span className="oc-working-dot" style={{ animationDelay: '280ms' }}>
                    ·
                </span>
            </span>
            <span className="oc-working-text">
                {text}
                {progress && <span className="text-muted-foreground/60 ml-1.5">[{progress}]</span>}
            </span>
        </span>
    );
}

/**
 * Full-panel working block. Use inside a terminal to take the whole card.
 */
export function WorkingPanel({ text, progress }: Pick<WorkingProps, 'text' | 'progress'>) {
    return (
        <div className="terminal">
            <div className="terminal-title">
                <span className="terminal-dot" />
                <span className="terminal-dot" />
                <span className="terminal-dot" />
                <span className="ml-2">in progress</span>
            </div>
            <div className="flex items-center gap-3 p-5">
                <Working text={text} {...(progress ? { progress } : {})} />
            </div>
        </div>
    );
}
