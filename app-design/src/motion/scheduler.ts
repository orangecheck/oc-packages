/*
 * One requestAnimationFrame loop for every scene on the page. A scene gets a
 * frame only while it is on screen, the tab is shown, and it still has
 * something to move; when no scene does, the loop stops and the page asks for
 * no frames at all. A scroll-driven scene draws only when the page scrolls:
 * one passive listener for all of them, at most one frame per scroll frame.
 */

export interface Scene {
    /**
     * Draw one frame. `dt` is seconds since the last frame this loop ran,
     * capped so a scene that slept never jumps. Return true to be called
     * again next frame, false to sleep until woken.
     */
    frame(now: number, dt: number): boolean;
}

export interface Ticket {
    /** Ask for frames again: from the next frame while the element is in view. */
    wake(): void;
    /** Whether the element is on screen. */
    readonly visible: boolean;
    /** Leave the loop for good. */
    stop(): void;
}

interface Entry {
    scene: Scene;
    el: Element;
    scroll: boolean;
    visible: boolean;
    awake: boolean;
    onVisible?: (visible: boolean) => void;
}

const entries = new Set<Entry>();
const byElement = new Map<Element, Set<Entry>>();
let io: IntersectionObserver | null = null;
let raf = 0;
let last = 0;
let listening = false;

function loop(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let more = false;
    for (const e of entries) {
        if (!e.awake || !e.visible) continue;
        e.awake = e.scene.frame(now, dt);
        if (e.awake) more = true;
    }
    if (more) kick();
    else last = 0;
}

function kick() {
    if (raf || document.hidden) return;
    for (const e of entries) {
        if (e.awake && e.visible) {
            raf = requestAnimationFrame(loop);
            return;
        }
    }
    last = 0;
}

function onScroll() {
    for (const e of entries) if (e.scroll && e.visible) e.awake = true;
    kick();
}

/** The scroll listener exists only while a scroll-driven scene is on screen. */
function listen() {
    const want = [...entries].some((e) => e.scroll && e.visible);
    if (want === listening) return;
    listening = want;
    if (want) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
    } else {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
    }
}

function onVisibility() {
    if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
    } else kick();
}

function observer(): IntersectionObserver | null {
    if (io || typeof IntersectionObserver === 'undefined') return io;
    io = new IntersectionObserver((records) => {
        for (const r of records) {
            for (const e of byElement.get(r.target) ?? []) {
                const was = e.visible;
                e.visible = r.isIntersecting;
                // A scroll scene catches up with wherever the page is when it comes back.
                if (e.visible && !was && e.scroll) e.awake = true;
                if (e.visible !== was) e.onVisible?.(e.visible);
            }
        }
        listen();
        kick();
    });
    document.addEventListener('visibilitychange', onVisibility);
    return io;
}

/**
 * Put a scene on the loop. It sleeps until the first `wake()` (a scroll scene
 * wakes itself when it comes into view and on every scroll).
 */
export function schedule(
    el: Element,
    scene: Scene,
    { scroll = false, onVisible }: { scroll?: boolean; onVisible?: (visible: boolean) => void } = {}
): Ticket {
    const obs = observer();
    // Without an observer, everything counts as on screen.
    const entry: Entry = { scene, el, scroll, visible: !obs, awake: false, onVisible };
    entries.add(entry);
    let set = byElement.get(el);
    if (!set) {
        set = new Set();
        byElement.set(el, set);
        obs?.observe(el);
    }
    set.add(entry);
    return {
        wake() {
            if (!entries.has(entry)) return;
            entry.awake = true;
            kick();
        },
        get visible() {
            return entry.visible;
        },
        stop() {
            entries.delete(entry);
            set.delete(entry);
            if (!set.size) {
                byElement.delete(el);
                obs?.unobserve(el);
            }
            listen();
            if (!entries.size) {
                cancelAnimationFrame(raf);
                raf = 0;
                last = 0;
                io?.disconnect();
                io = null;
                document.removeEventListener('visibilitychange', onVisibility);
            }
        },
    };
}
