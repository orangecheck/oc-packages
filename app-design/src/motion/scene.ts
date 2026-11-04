/*
 * The life of a canvas scene, shared by every scene in ./motion: a Surface
 * sized to its box, a place on the one loop, and a redraw when the box or the
 * theme changes. A scene supplies the drawing; this supplies the when.
 */
import { isDark, onTheme } from './env';
import { Surface } from './paint';
import { report, schedule } from './scheduler';

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
        onFail,
    }: {
        ground?: 'auto' | 'light' | 'dark';
        scroll?: boolean;
        /** Called once, after the first frame is on the canvas: the moment to hide a poster. */
        onDraw?: () => void;
        /** The scene threw and has stopped, its canvas cleared, or there is no 2D canvas at all: the moment to show the poster again. */
        onFail?: () => void;
    } = {}
): Mounted {
    // No 2D canvas (a test DOM such as jsdom, a locked-down browser): the scene stays its poster.
    if (!canvas.getContext('2d', { alpha: true, willReadFrequently: true })) {
        onFail?.();
        return { wake() {}, stop() {} };
    }
    let parts: SceneParts | null = null;
    let drawn = false;
    let offTheme = () => {};
    const surface = new Surface(canvas, () =>
        run(() => {
            parts?.layout?.();
            wake();
        })
    );
    const frame = (now: number, dt: number) => {
        if (!parts) return false;
        const more = parts.frame(now, dt);
        if (!drawn) {
            drawn = true;
            onDraw?.();
        }
        return more;
    };
    const ticket = schedule(
        host,
        { frame },
        {
            scroll,
            onVisible: (on) => parts?.visible?.(on),
            onError: fail,
        }
    );
    function stop() {
        offTheme();
        ticket.stop();
        surface.dispose();
        // The scene's own listeners go too, even when it is stopping because it threw.
        try {
            parts?.dispose?.();
        } catch (err) {
            report(err);
        }
        parts = null;
    }
    /** The scene threw: it lets go of everything it holds, clears its canvas, and the poster comes back. */
    function fail() {
        stop();
        surface.clear();
        onFail?.();
    }
    /** Scene code run outside the loop (building, a resize, a theme change): a throw there fails the scene, as in a frame. */
    function run(f: () => void) {
        try {
            f();
        } catch (err) {
            report(err);
            fail();
        }
    }
    const wake = () => ticket.wake();
    const dark = () => (ground === 'auto' ? isDark(host) : ground === 'dark');
    run(() => {
        parts = build(surface, wake);
        parts.layout?.();
        parts.theme?.(dark());
    });
    if (parts && ground === 'auto')
        offTheme = onTheme(() =>
            run(() => {
                parts?.theme?.(dark());
                wake();
            })
        );
    return { wake, stop };
}
