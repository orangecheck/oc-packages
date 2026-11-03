/*
 * The life of a canvas scene, shared by every scene in ./motion: a Surface
 * sized to its box, a place on the one loop, and a redraw when the box or the
 * theme changes. A scene supplies the drawing; this supplies the when.
 */
import { isDark, onTheme } from './env';
import { Surface } from './paint';
import { schedule } from './scheduler';

export interface SceneParts {
    /** Draw a frame; true while something still moves. */
    frame(now: number, dt: number): boolean;
    /** The box changed size: recompute positions before the redraw. */
    layout?(): void;
    /** The ground changed between light and dark: recompute colours before the redraw. */
    theme?(dark: boolean): void;
    /** The scene came on screen or left it. */
    visible?(on: boolean): void;
    /** The scene is leaving: drop its listeners. */
    dispose?(): void;
}

export interface Mounted {
    surface: Surface;
    /** Ask for frames: the scene runs while it is on screen and has something to move. */
    wake(): void;
    stop(): void;
}

/**
 * Put a scene on `canvas` and on the loop. `host` is the element whose
 * visibility counts (usually the scene's own box). `ground` 'auto' follows the
 * theme; 'light' or 'dark' pins it, for a scene on a band of its own colour.
 */
export function mountScene(
    canvas: HTMLCanvasElement,
    host: Element,
    build: (surface: Surface, wake: () => void) => SceneParts,
    {
        ground = 'auto',
        scroll = false,
        onDraw,
    }: {
        ground?: 'auto' | 'light' | 'dark';
        scroll?: boolean;
        /** Called once, after the first frame is on the canvas: the moment to hide a poster. */
        onDraw?: () => void;
    } = {}
): Mounted {
    let parts: SceneParts | null = null;
    let wake = () => {};
    let drawn = false;
    const surface = new Surface(canvas, () => {
        parts?.layout?.();
        wake();
    });
    const frame = (now: number, dt: number) => {
        if (!parts) return false;
        const more = parts.frame(now, dt);
        if (!drawn) {
            drawn = true;
            onDraw?.();
        }
        return more;
    };
    const ticket = schedule(host, { frame }, { scroll, onVisible: (on) => parts?.visible?.(on) });
    wake = () => ticket.wake();
    parts = build(surface, wake);
    const dark = () => (ground === 'auto' ? isDark(host) : ground === 'dark');
    parts.layout?.();
    parts.theme?.(dark());
    const offTheme =
        ground === 'auto'
            ? onTheme(() => {
                  parts?.theme?.(dark());
                  wake();
              })
            : () => {};
    return {
        surface,
        wake,
        stop() {
            offTheme();
            ticket.stop();
            surface.dispose();
            parts?.dispose?.();
            parts = null;
        },
    };
}
