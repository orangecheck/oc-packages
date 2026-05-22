'use client';

import { Check, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from './cn';
import { useOcSkin } from './provider';

/**
 * OcThemePicker — the skin selector. Sits beside `ThemeToggle` in the header.
 * Self-contained dropdown (no Radix): outside-click + Escape to close. Mirrors
 * the ghost-icon affordance of `ThemeToggle`. Gate its mount behind
 * `NEXT_PUBLIC_OC_THEME_PICKER` during staged rollout.
 */
export interface OcThemePickerProps {
    className?: string;
    triggerClassName?: string;
    popoverClassName?: string;
}

export function OcThemePicker({ className, triggerClassName, popoverClassName }: OcThemePickerProps) {
    const { skin, setSkin, themes } = useOcSkin();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onDown(e: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <button
                type="button"
                aria-label="choose theme"
                aria-haspopup="menu"
                aria-expanded={open}
                title="choose theme"
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    'text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    triggerClassName
                )}
            >
                <Palette className="size-4" aria-hidden />
            </button>

            {open && (
                <div
                    role="menu"
                    className={cn(
                        'bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border shadow-md',
                        popoverClassName
                    )}
                >
                    <div className="label-mono text-muted-foreground px-3 pt-3 pb-1">theme</div>
                    <ul className="pb-1">
                        {themes.map((t) => {
                            const active = t.id === skin;
                            return (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        onClick={() => {
                                            setSkin(t.id);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            'hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                                            active && 'text-foreground'
                                        )}
                                    >
                                        <span className="mt-0.5 size-4 shrink-0">
                                            {active && <Check className="size-4 text-primary" aria-hidden />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium">{t.label}</span>
                                            <span className="text-muted-foreground block text-xs leading-snug">
                                                {t.description}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
