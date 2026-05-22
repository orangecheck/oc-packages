'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '../tokens/cn';
import { Button } from './button';

/**
 * Compact icon-button light/dark toggle used in the desktop header. This is the
 * *mode* axis (next-themes `.dark` class) — orthogonal to `OcThemePicker`, which
 * is the named-theme (skin) axis.
 */
export function ThemeToggle({ className }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = resolvedTheme === 'dark';
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={cn('text-muted-foreground hover:text-foreground', className)}
        >
            {!mounted ? (
                <span className="block size-4" />
            ) : isDark ? (
                <Sun className="size-4" />
            ) : (
                <Moon className="size-4" />
            )}
        </Button>
    );
}

/**
 * Link-like variant for use inside the mobile drawer (matches other menu items).
 */
export function ThemeToggleLink() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isDark = mounted && resolvedTheme === 'dark';
    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="hover:text-foreground flex w-full items-center justify-between px-2 py-2 text-left text-xs tracking-wide uppercase transition-colors"
        >
            <span className="tracking-wide lowercase">
                {'> '}
                {mounted ? (isDark ? 'light mode' : 'dark mode') : 'theme'}
            </span>
            {mounted && (isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />)}
        </button>
    );
}
