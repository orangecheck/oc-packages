'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

import { cn } from './cn';

export interface OcAuroraProps {
    /**
     * Master intensity multiplier (default 1, from the theme CSS). Overrides
     * `--oc-aurora-intensity` for this mount — e.g. dial a reading-heavy site down.
     */
    intensity?: number;
    /**
     * Mount the OcAuroraGL silk-field upgrade (aurora depth R2). Default off.
     * When every gate passes (WebGL2 with a real GPU, no reduced-motion, no
     * saveData / low-memory signal, ambient motion on), a ~8 KB chunk
     * lazy-loads after idle and crossfades over the CSS blobs — which then
     * pause. Every failure or opt-out path silently keeps the CSS aurora.
     * Per-site kill switch without a package release: `.oc-aurora { --oc-aurora-gl: off }`.
     */
    gl?: boolean;
    className?: string;
}

const BLOBS = [1, 2, 3, 4, 5] as const;

/** requestIdleCallback is disabled in every stable Safari — always pair it
 *  with a setTimeout fallback or the GL layer never boots on iOS. */
function onIdle(cb: () => void, timeout: number): () => void {
    if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(cb, { timeout });
        return () => cancelIdleCallback(id);
    }
    const id = setTimeout(cb, timeout);
    return () => clearTimeout(id);
}

/**
 * The ambient "bitcoin aurora" background — soft, theme-reactive colour clouds
 * that slowly wander (styling in styles/aurora.css; recolours from --brand /
 * --success / --info / --primary across mode + skin). Pure markup, fixed behind
 * all content; `OcThemeProvider` mounts it by default. The CSS blobs are the
 * permanent SSR / no-JS / reduced-motion / no-WebGL floor; the optional `gl`
 * layer only ever renders on top of them.
 */
export function OcAurora({ intensity, gl = false, className }: OcAuroraProps) {
    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!gl) return;
        const host = hostRef.current;
        if (!host) return;

        let disposed = false;
        let disposeScene: (() => void) | null = null;
        let cancelIdle: (() => void) | null = null;

        const prm = matchMedia('(prefers-reduced-motion: reduce)');
        const forced = matchMedia('(forced-colors: active)');

        function gatesPass(): boolean {
            if (prm.matches || forced.matches) return false;
            if (document.documentElement.getAttribute('data-oc-motion') === 'off') return false;
            // Chromium-only signals are one-way downgrades: undefined = proceed.
            const nav = navigator as Navigator & {
                connection?: { saveData?: boolean };
                deviceMemory?: number;
            };
            if (nav.connection?.saveData === true) return false;
            if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return false;
            return true;
        }

        function boot() {
            cancelIdle = onIdle(async () => {
                if (disposed || disposeScene || !gatesPass()) return;
                try {
                    const mod = await import('./aurora-gl');
                    if (disposed || disposeScene || !gatesPass()) return;
                    disposeScene = mod.mountAuroraGL(host!);
                } catch {
                    /* chunk failed to load — CSS floor stays, silently */
                }
            }, 2000);
        }

        function teardownScene() {
            disposeScene?.();
            disposeScene = null;
        }

        // Live demotions: an OS-level reduced-motion flip mid-session tears the
        // scene down; motion returning re-runs the boot gate. (The scene also
        // self-disposes on data-oc-motion="off" via its own theme subscription.)
        const onPrmChange = () => {
            if (prm.matches) teardownScene();
            else if (!disposeScene) boot();
        };
        prm.addEventListener?.('change', onPrmChange);

        const mo = new MutationObserver(() => {
            const off = document.documentElement.getAttribute('data-oc-motion') === 'off';
            if (!off && !disposeScene && !disposed) boot();
        });
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-oc-motion'],
        });

        if (document.readyState === 'complete') boot();
        else {
            const onLoad = () => boot();
            window.addEventListener('load', onLoad, { once: true });
        }

        return () => {
            disposed = true;
            cancelIdle?.();
            prm.removeEventListener?.('change', onPrmChange);
            mo.disconnect();
            teardownScene();
        };
    }, [gl]);

    const style =
        intensity == null
            ? undefined
            : ({ '--oc-aurora-intensity': String(intensity) } as CSSProperties);
    return (
        <div ref={hostRef} className={cn('oc-aurora', className)} style={style} aria-hidden="true">
            {BLOBS.map((n) => (
                <div key={n} className={`oc-aurora__blob oc-aurora__blob-${n}`} />
            ))}
            <div className="oc-aurora__grain" />
        </div>
    );
}
