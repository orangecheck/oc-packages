'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

/**
 * OcThemeBridge — cross-subdomain persistence for the MODE axis (light/dark).
 *
 * `next-themes` defaults to origin-scoped `localStorage`, so a dark/light choice
 * on one `*.ochk.io` site won't carry to another. This layers an
 * `oc_theme` cookie at `Domain=.ochk.io` on top so the choice is visible
 * family-wide. (The SKIN axis has its own `oc_skin` bridge inside
 * `OcThemeProvider`; this is the mode counterpart, previously duplicated in
 * every consumer repo.)
 *
 * Mount once inside the next-themes `<ThemeProvider>`:
 *
 *     <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
 *         <OcThemeBridge />
 *         <OcThemeProvider>…</OcThemeProvider>
 *     </ThemeProvider>
 *
 * The cookie is intentionally non-HttpOnly (next-themes JS reads/writes it) and
 * carries no auth value — a leak only reveals a theme preference.
 */
const COOKIE = 'oc_theme';
const ALLOWED = new Set(['light', 'dark', 'system']);
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            const v = decodeURIComponent(trimmed.slice(prefix.length));
            return v.length > 0 ? v : null;
        }
    }
    return null;
}

function writeCookie(value: string): void {
    if (typeof document === 'undefined') return;
    if (!ALLOWED.has(value)) return;
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const parts = [
        `${COOKIE}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${ONE_YEAR}`,
        'SameSite=Lax',
    ];
    if (!isLocal) {
        parts.push('Domain=.ochk.io');
        parts.push('Secure');
    }
    document.cookie = parts.join('; ');
}

export function OcThemeBridge() {
    const { theme, setTheme } = useTheme();
    const hydratedRef = useRef(false);

    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const cookieValue = readCookie(COOKIE);
        if (cookieValue && ALLOWED.has(cookieValue) && cookieValue !== theme) {
            setTheme(cookieValue);
        }
    }, [theme, setTheme]);

    useEffect(() => {
        if (!hydratedRef.current) return;
        if (!theme) return;
        writeCookie(theme);
    }, [theme]);

    return null;
}
