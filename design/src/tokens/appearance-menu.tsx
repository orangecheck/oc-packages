'use client';

import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';

import { cn } from './cn';
import { useOcSkin } from './provider';

/**
 * OcAppearanceMenu — the single header control for ALL appearance settings.
 *
 * One icon button opens a dropdown with both axes:
 *   • mode  — light / dark / system   (next-themes `.dark` class)
 *   • theme — the registered skins     (data-oc-theme, persisted .ochk.io)
 *
 * Replaces the separate `ThemeToggle` + `OcThemePicker` so every family site
 * carries exactly one appearance control. Self-contained dropdown (no Radix):
 * outside-click + Escape to close. Requires `<OcThemeProvider>` above it (skin
 * axis) and a next-themes `<ThemeProvider>` (mode axis) — both already mounted
 * on every family site.
 */
export interface OcAppearanceMenuProps {
    className?: string;
    triggerClassName?: string;
    popoverClassName?: string;
}

const MODES = [
    { id: 'light', label: 'light', Icon: Sun },
    { id: 'dark', label: 'dark', Icon: Moon },
    { id: 'system', label: 'system', Icon: Monitor },
] as const;

export function OcAppearanceMenu({
    className,
    triggerClassName,
    popoverClassName,
}: OcAppearanceMenuProps) {
    const { skin, setSkin, themes } = useOcSkin();
    const { theme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);

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

    // Avoid a hydration mismatch: only reflect the active mode after mount.
    const activeMode = mounted ? (theme ?? 'system') : null;

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <button
                type="button"
                aria-label="appearance settings"
                aria-haspopup="menu"
                aria-expanded={open}
                title="appearance · mode + theme"
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
                    {/* Mode — segmented light / dark / system */}
                    <div className="label-mono text-muted-foreground px-3 pt-3 pb-2">mode</div>
                    <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                        {MODES.map(({ id, label, Icon }) => {
                            const active = activeMode === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={active}
                                    onClick={() => setTheme(id)}
                                    className={cn(
                                        'flex flex-col items-center gap-1 rounded-md border py-2 text-[11px] transition-colors',
                                        active
                                            ? 'border-primary text-foreground bg-accent'
                                            : 'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                    )}
                                >
                                    <Icon className="size-4" aria-hidden />
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Theme — the registered skins */}
                    <div className="label-mono text-muted-foreground border-t px-3 pt-3 pb-1">
                        theme
                    </div>
                    <ul className="pb-1">
                        {themes.map((t) => {
                            const active = t.id === skin;
                            return (
                                <li key={t.id}>
                                    <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={active}
                                        onClick={() => setSkin(t.id)}
                                        className={cn(
                                            'hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
                                            active && 'text-foreground'
                                        )}
                                    >
                                        <span className="mt-0.5 size-4 shrink-0">
                                            {active && (
                                                <Check className="text-primary size-4" aria-hidden />
                                            )}
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
