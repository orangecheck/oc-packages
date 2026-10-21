import { useEffect, useRef } from 'react';

/*
 * Page shortcuts ("/" for search, "l" to lock) that never fire while the
 * person is typing, or while a dialog, menu or popover holds the keyboard.
 * Each site had its own "is the user typing?" test and none of them looked
 * for an open layer: "l" on a button in vault's entry editor locked the
 * vault and lost the entry.
 */

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);
const TEXT_ROLES = /^(textbox|searchbox|combobox|spinbutton)$/;
const LAYER = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="menubar"],[role="listbox"],[data-radix-popper-content-wrapper]';

// By tag, not instanceof: a key press from an iframe's element is of another window's classes.
function editable(el: Element): boolean {
    if (el.tagName === 'INPUT') return !NOT_TEXT.has((el as HTMLInputElement).type);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return TEXT_ROLES.test(el.getAttribute('role') ?? '');
}

/**
 * True when this key press belongs to something else and a page shortcut
 * must not run: it was handled, it is composing text, its modifiers are not
 * the shortcut's, it lands in a field, or a dialog, menu or popover is open
 * around it. `mod` shortcuts (⌘K, Ctrl-K) run from fields and layers too.
 */
export function hotkeyBlocked(e: KeyboardEvent, opts: { mod?: boolean } = {}): boolean {
    if (e.defaultPrevented || e.isComposing) return true;
    if (opts.mod) return !(e.metaKey || e.ctrlKey) || e.altKey;
    if (e.metaKey || e.ctrlKey || e.altKey) return true;
    const target = (e.target as Node | null)?.nodeType === 1 ? (e.target as Element) : null;
    if (target && target !== document.body && target !== document.documentElement) {
        return editable(target) || target.closest(LAYER) !== null;
    }
    // Focus fell to the page while a modal is open: the keys are still the modal's.
    return document.querySelector('[role="dialog"][aria-modal="true"],[role="alertdialog"]') !== null;
}

/**
 * Run `handler` on these keys (matched on `e.key` exactly: pass "?" for
 * "?"), from a window keydown, unless hotkeyBlocked says no. A handled key's
 * default is prevented. The newest handler runs without re-listening.
 */
export function useHotkey(
    keys: string | readonly string[],
    handler: (e: KeyboardEvent) => void,
    opts: { enabled?: boolean; mod?: boolean } = {}
): void {
    const { enabled = true, mod = false } = opts;
    const latest = useRef(handler);
    useEffect(() => {
        latest.current = handler;
    });
    const list = typeof keys === 'string' ? keys : keys.join('\u0000');
    useEffect(() => {
        if (!enabled) return;
        const wanted = list.split('\u0000');
        const onKey = (e: KeyboardEvent) => {
            if (!wanted.includes(e.key) || hotkeyBlocked(e, { mod })) return;
            e.preventDefault();
            latest.current(e);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [list, enabled, mod]);
}
