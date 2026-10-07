'use client';

import { useEffect, type RefObject } from 'react';

const ITEMS = '[role^="menuitem"], a[href], button:not([disabled])';

/**
 * The keyboard and dismiss model every hand-rolled header menu shares: focus
 * moves into the menu when it opens, arrows and Home/End walk its items, Escape
 * closes it and hands focus back to the trigger, and a tap anywhere outside
 * closes it (`pointerdown`, since iOS sends no `mousedown` for a tap on a
 * non-clickable area). `root` wraps both the trigger and the `[role="menu"]`.
 */
export function useMenu(open: boolean, setOpen: (open: boolean) => void, root: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!open) return;
        const menu = () => root.current?.querySelector<HTMLElement>('[role="menu"]') ?? null;
        const items = () => Array.from(menu()?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
        const trigger = () => root.current?.querySelector<HTMLElement>('[aria-haspopup]') ?? null;

        const first = requestAnimationFrame(() => items()[0]?.focus());

        function onDown(e: PointerEvent) {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setOpen(false);
                trigger()?.focus();
                return;
            }
            const list = items();
            if (!list.length || !menu()?.contains(document.activeElement)) return;
            const i = list.indexOf(document.activeElement as HTMLElement);
            const go = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
            if (go === undefined) return;
            e.preventDefault();
            list[(go + list.length) % list.length]?.focus();
        }
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(first);
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, setOpen, root]);
}
