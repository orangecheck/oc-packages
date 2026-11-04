/*
 * The part of the window a reader sees. On a phone the app shell's TabBar is
 * fixed over the bottom of it, so "on screen", and every IntersectionObserver
 * in the package, stops at the bar's top edge. The bar publishes its height
 * (its own box, the safe area in it) as --oca-tabbar-h on the root; nothing
 * else measures it, and the focus padding in theme.css reads the same value.
 */

const VAR = '--oca-tabbar-h';
const changed = new Set<() => void>();
// Every bar mounted now, with its height: two at once (a shell inside a shell, or the old one and the new one
// across a route change) publish the deeper, and the one left keeps its value when the other goes.
const bars = new Map<HTMLElement, number>();

/** How much of the window's bottom the TabBar covers, in px: 0 with no bar, and from md, where it is hidden. */
export function bottomInset(): number {
    if (typeof document === 'undefined') return 0;
    return parseFloat(document.documentElement.style.getPropertyValue(VAR)) || 0;
}

/** The window's visible bottom edge, in client px. */
export function visibleBottom(): number {
    return window.innerHeight - bottomInset();
}

/**
 * A root margin with the TabBar taken off its bottom: a percentage there
 * counts in the visible height. With no bar it is returned as given.
 */
export function visibleMargin(rootMargin = '0px'): string {
    const inset = bottomInset();
    if (!inset) return rootMargin;
    const [t = '0px', r = t, b = t, l = r] = rootMargin.trim().split(/\s+/);
    const n = parseFloat(b) || 0;
    const px = b.endsWith('%') ? (n / 100) * (window.innerHeight - inset) : n;
    return `${t} ${r} ${Math.round(px - inset)}px ${l}`;
}

/**
 * An IntersectionObserver whose root stops at the TabBar. When the bar comes,
 * goes or changes height, it is made again with the new margin and watches the
 * same elements, so an observer made before a shell mounted keeps up.
 */
export function visibleObserver(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}): VisibleObserver {
    const watched = new Set<Element>();
    const make = () => new IntersectionObserver(callback, { ...options, rootMargin: visibleMargin(options.rootMargin) });
    let io = make();
    const remake = () => {
        io.disconnect();
        io = make();
        for (const el of watched) io.observe(el);
    };
    changed.add(remake);
    return {
        observe(el: Element) {
            watched.add(el);
            io.observe(el);
        },
        unobserve(el: Element) {
            watched.delete(el);
            io.unobserve(el);
        },
        disconnect() {
            watched.clear();
            io.disconnect();
            changed.delete(remake);
        },
    };
}

export interface VisibleObserver {
    observe(el: Element): void;
    unobserve(el: Element): void;
    disconnect(): void;
}

function publish() {
    const root = document.documentElement;
    const value = bars.size ? `${Math.max(...bars.values())}px` : null;
    if ((root.style.getPropertyValue(VAR) || null) === value) return;
    if (value === null) root.style.removeProperty(VAR);
    else root.style.setProperty(VAR, value);
    for (const fn of changed) fn();
}

/** The TabBar's half: publish its height while it is mounted, and tell the observers when it changes. */
export function publishBottomInset(bar: HTMLElement): () => void {
    const measure = () => {
        bars.set(bar, bar.getBoundingClientRect().height);
        publish();
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(bar);
    return () => {
        ro?.disconnect();
        bars.delete(bar);
        publish();
    };
}
