'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import {
    accentFor,
    DEFAULT_OC_THEME,
    OC_DEFAULT_ACCENT,
    OC_SKIN_COOKIE,
    OC_THEMES,
    resolveTheme,
    type OcTheme,
} from './themes';
import { OcAurora } from './aurora';

declare global {
    interface Window {
        /** Defined by `getOcThemeInitScript()`; recolors favicon + theme-color. */
        __ocApplySkinChrome?: (skin: string) => void;
    }
}

/**
 * OcThemeProvider — the skin (named-theme) axis.
 *
 * Orthogonal to `next-themes`, which owns light/dark via the `.dark` class.
 * This provider owns the `data-oc-theme` attribute on `<html>` and persists the
 * choice in the `oc_skin` cookie at `Domain=.ochk.io`, so a skin chosen on one
 * `*.ochk.io` site is honored on every other. It re-reads the cookie on focus /
 * visibility change so a fresh choice picks up when the user returns to a tab
 * (same cross-site pickup trick `OcAccountMenu` uses for sign-in).
 *
 * Mount once, inside (or beside) the `next-themes` `<ThemeProvider>`:
 *
 *     <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
 *         <OcThemeProvider>
 *             …app…
 *         </OcThemeProvider>
 *     </ThemeProvider>
 *
 * Pair with `getOcThemeInitScript()` in `_document` to avoid a flash before
 * hydration.
 */

const ONE_YEAR = 60 * 60 * 24 * 365;
const ATTR = 'data-oc-theme';

function readSkinCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const prefix = `${OC_SKIN_COOKIE}=`;
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            const v = decodeURIComponent(trimmed.slice(prefix.length));
            return v.length > 0 ? v : null;
        }
    }
    return null;
}

function writeSkinCookie(value: string): void {
    if (typeof document === 'undefined') return;
    const isLocal =
        location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const parts = [
        `${OC_SKIN_COOKIE}=${encodeURIComponent(value)}`,
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

function applyAttr(skin: string): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute(ATTR, skin);
}

/**
 * Swap the browser chrome (favicon + `<meta name="theme-color">`) to the skin's
 * accent. The real work lives in the global installed by
 * `getOcThemeInitScript()` (so the favicon's original SVG is captured exactly
 * once, before the init script's own first recolor — avoids re-reading an
 * already-swapped data: URI). If the init script wasn't included, fall back to
 * the theme-color swap alone (favicon recolor needs the captured original).
 */
function applySkinChrome(skin: string): void {
    if (typeof window === 'undefined') return;
    if (typeof window.__ocApplySkinChrome === 'function') {
        window.__ocApplySkinChrome(skin);
        return;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', accentFor(skin));
}

interface OcSkinContextValue {
    /** Current skin id (always resolved to a known theme). */
    skin: string;
    /** Set the skin: validates, applies the attribute, persists the cookie. */
    setSkin: (id: string) => void;
    /** The full registry, for rendering a picker. */
    themes: readonly OcTheme[];
}

const OcSkinContext = createContext<OcSkinContextValue | null>(null);

export interface OcThemeProviderProps {
    children: ReactNode;
    /** Skin to assume before the cookie is read (defaults to `orangecheck`). */
    defaultSkin?: string;
    /**
     * The ambient bitcoin-aurora background. `true` (default) renders it behind
     * the app; `false` disables it; `{ intensity }` tunes its strength for this
     * site (e.g. `aurora={{ intensity: 0.5 }}` on a reading-heavy surface).
     */
    aurora?: boolean | { intensity?: number };
}

export function OcThemeProvider({
    children,
    defaultSkin = DEFAULT_OC_THEME,
    aurora = true,
}: OcThemeProviderProps) {
    const [skin, setSkinState] = useState<string>(() => resolveTheme(defaultSkin));
    const hydratedRef = useRef(false);

    // Hydrate from the cookie once on mount and align the attribute.
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const fromCookie = resolveTheme(readSkinCookie() ?? defaultSkin);
        applyAttr(fromCookie);
        applySkinChrome(fromCookie);
        setSkinState(fromCookie);
    }, [defaultSkin]);

    // Cross-site pickup: re-read the cookie when the tab regains focus.
    useEffect(() => {
        function sync() {
            const fromCookie = resolveTheme(readSkinCookie() ?? skin);
            if (fromCookie !== skin) {
                applyAttr(fromCookie);
                applySkinChrome(fromCookie);
                setSkinState(fromCookie);
            }
        }
        window.addEventListener('focus', sync);
        document.addEventListener('visibilitychange', sync);
        return () => {
            window.removeEventListener('focus', sync);
            document.removeEventListener('visibilitychange', sync);
        };
    }, [skin]);

    const setSkin = useCallback((id: string) => {
        const next = resolveTheme(id);
        applyAttr(next);
        applySkinChrome(next);
        writeSkinCookie(next);
        setSkinState(next);
    }, []);

    const value = useMemo<OcSkinContextValue>(
        () => ({ skin, setSkin, themes: OC_THEMES }),
        [skin, setSkin]
    );

    return (
        <OcSkinContext.Provider value={value}>
            {aurora !== false && (
                <OcAurora intensity={typeof aurora === 'object' ? aurora.intensity : undefined} />
            )}
            {children}
        </OcSkinContext.Provider>
    );
}

/** Read the current skin + setter. Throws if used outside `OcThemeProvider`. */
export function useOcSkin(): OcSkinContextValue {
    const ctx = useContext(OcSkinContext);
    if (!ctx) {
        throw new Error('useOcSkin must be used within <OcThemeProvider>');
    }
    return ctx;
}

/**
 * Blocking init script for `_document` (Pages Router) `<Head>`. Applies the
 * cookie's skin to `<html>` before first paint so there is no flash of the
 * default skin. Inject with:
 *
 *     <script dangerouslySetInnerHTML={{ __html: getOcThemeInitScript() }} />
 */
export function getOcThemeInitScript(defaultSkin: string = DEFAULT_OC_THEME): string {
    // Self-contained IIFE — no imports available at parse time. Beyond applying
    // the skin attribute before first paint, it installs `window.__ocApplySkinChrome`
    // (the single owner of the favicon + theme-color swap) and runs it for the
    // saved skin. OcThemeProvider re-invokes the same global on later changes, so
    // the favicon's *original* SVG is captured exactly once (before any recolor)
    // and re-recolored from `#f97316` to the active skin's accent. The favicon
    // recolor is async (a fetch of the same-origin favicon.svg) — chrome updates
    // a beat after paint, which is fine; the skin attribute itself is synchronous.
    const accents = Object.fromEntries(OC_THEMES.map((t) => [t.id, t.accent]));
    return (
        `(function(){` +
        `var ACC=${JSON.stringify(accents)},DEF=${JSON.stringify(defaultSkin)},ORIG=${JSON.stringify(OC_DEFAULT_ACCENT)},fav=null;` +
        `function acc(s){return ACC[s]||ACC[DEF]||ORIG;}` +
        `window.__ocApplySkinChrome=function(s){try{` +
        `var a=acc(s);` +
        `var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute('content',a);}` +
        `var link=document.querySelector('link[rel~="icon"][type="image/svg+xml"]');if(!link){return;}` +
        `var paint=function(svg){link.setAttribute('href','data:image/svg+xml,'+encodeURIComponent(svg.split(ORIG).join(a)));};` +
        `if(fav!=null){paint(fav);return;}` +
        `var h=link.getAttribute('href');if(!h||h.indexOf('data:')===0){return;}` +
        `fetch(h).then(function(r){return r.text();}).then(function(svg){fav=svg;paint(svg);}).catch(function(){});` +
        `}catch(e){}};` +
        `try{var m=document.cookie.match(/(?:^|; )${OC_SKIN_COOKIE}=([^;]*)/);var s=m?decodeURIComponent(m[1]):DEF;if(!s){s=DEF;}` +
        `document.documentElement.setAttribute('${ATTR}',s);window.__ocApplySkinChrome(s);}` +
        `catch(e){document.documentElement.setAttribute('${ATTR}',DEF);}` +
        `})();`
    );
}
