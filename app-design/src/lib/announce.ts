const ID = 'oca-announcer';
let pending: ReturnType<typeof setTimeout> | undefined;
let clearing: ReturnType<typeof setTimeout> | undefined;

/**
 * The page's one polite live region, made on first call and kept. Call it
 * when a control that will announce mounts: a region added at the moment it
 * speaks may not be heard.
 */
export function announcer(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    // Found by id, so two copies of this module (one per bundle) share one region.
    let el = document.getElementById(ID);
    if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');
        // Inline, so it is hidden on a page whose CSS has no sr-only.
        el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
        document.body.append(el);
    }
    return el;
}

/** Say a short status ("Copied") to a screen reader, through the page's one live region. */
export function announce(message: string) {
    const el = announcer();
    if (!el) return;
    clearTimeout(pending);
    clearTimeout(clearing);
    // Emptied, then filled a beat later: the same words twice in a row are said twice.
    el.textContent = '';
    pending = setTimeout(() => {
        el.textContent = message;
        // Gone once said, so nobody finds a stale "Copied" reading the page later.
        clearing = setTimeout(() => {
            if (el.textContent === message) el.textContent = '';
        }, 5000);
    }, 100);
}
