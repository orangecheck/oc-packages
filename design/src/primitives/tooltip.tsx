'use client';

import * as Popover from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '../tokens/cn';

/**
 * `<Tooltip>` — the family's hover/focus tooltip primitive.
 *
 * Built on `@radix-ui/react-popover` (already a dependency — we do NOT add
 * `@radix-ui/react-tooltip`) but driven by a *controlled* open boolean so we
 * own the timing and gating Radix's popover doesn't give a tooltip:
 *
 *   - hover-intent: opens after `openDelay`ms of sustained pointer hover,
 *     closes after a short `closeDelay` grace (WCAG 1.4.13 hoverable).
 *   - keyboard parity: also opens on keyboard focus (detected via input-
 *     modality, since `:focus-visible` isn't applied yet inside the focus
 *     event), closes on blur/Escape, never steals or traps focus.
 *   - pointer-fine only: the hover path is gated behind
 *     `(hover: hover) and (pointer: fine)` so it never fires on touch — by
 *     pointer *type*, not a width breakpoint (a coarse tablet ≥ sm is touch).
 *   - `disabled`: a hard force-close, used by `OcLogoDropdown` so the tip and
 *     the family menu (which share a trigger) can never paint at once.
 *
 * The content is decorative reinforcement: it's `aria-hidden`, and
 * `pointer-events-none` so a mis-detected pointer can never intercept the
 * click path to the trigger. The authoritative accessible name belongs on the
 * trigger's own `aria-label`.
 */

const TOOLTIP_SURFACE_CLASS =
    'bg-popover text-popover-foreground border-border rounded-md border p-2.5 shadow-md';

// Same idiom as the popover/dialog primitives, a touch faster (tooltips are
// lighter than dialogs) with a smaller 4px travel. Reduced-motion is handled
// globally by the family `prefers-reduced-motion` reset — nothing to add here.
const TOOLTIP_MOTION_CLASS =
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 origin-(--radix-popover-content-transform-origin) duration-150 ease-out';

export interface TooltipProps {
    /** The tooltip body. */
    content: React.ReactNode;
    /** A single trigger element (a `<button>` etc.); receives the hover/focus wiring. */
    children: React.ReactElement;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    collisionPadding?: number;
    /** ms of sustained hover before opening. Default 300 (deliberate, not twitchy). */
    openDelay?: number;
    /** ms grace before closing on pointer-leave. Default 90. */
    closeDelay?: number;
    /** Force the tooltip closed regardless of hover/focus (e.g. while a shared menu is open). */
    disabled?: boolean;
    /** Portal to `<body>` (default true). Set false to keep content inline so it inherits a scoped `data-oc-theme`. */
    portal?: boolean;
    /** z-index utility for the content. Default `z-50`. */
    zIndexClassName?: string;
    contentClassName?: string;
}

interface TriggerHandlerProps {
    onPointerEnter?: React.PointerEventHandler;
    onPointerLeave?: React.PointerEventHandler;
    onPointerDown?: React.PointerEventHandler;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
    onKeyDown?: React.KeyboardEventHandler;
}

function compose<E>(theirs: ((e: E) => void) | undefined, ours: (e: E) => void) {
    return (e: E) => {
        theirs?.(e);
        ours(e);
    };
}

/**
 * Input-modality tracker (the `:focus-visible` polyfill heuristic).
 * `:focus-visible` is NOT reliably applied synchronously inside the `focus`
 * event, so reading `el.matches(':focus-visible')` there misses keyboard focus.
 * Instead we record the last input type from global capture-phase listeners
 * that fire BEFORE focus: a keydown means the focus that follows is keyboard-
 * driven (show the hint); a pointerdown means it's a click (don't — that would
 * flash the tip over the menu).
 */
let lastInputWasKeyboard = false;
let modalityInstalled = false;
function installModalityTracking() {
    if (modalityInstalled || typeof window === 'undefined') return;
    modalityInstalled = true;
    window.addEventListener('keydown', () => (lastInputWasKeyboard = true), true);
    window.addEventListener('pointerdown', () => (lastInputWasKeyboard = false), true);
}

export function Tooltip({
    content,
    children,
    side = 'bottom',
    align = 'start',
    sideOffset = 8,
    collisionPadding = 12,
    openDelay = 300,
    closeDelay = 90,
    disabled = false,
    portal = true,
    zIndexClassName = 'z-50',
    contentClassName,
}: TooltipProps) {
    const [hovering, setHovering] = React.useState(false);
    const [focusing, setFocusing] = React.useState(false);
    const [isFinePointer, setIsFinePointer] = React.useState(false);
    const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Detect a true mouse (fine pointer + real hover). Defaults false for SSR
    // and first client render, then resolves in the effect — a normal post-mount
    // update, not a hydration mismatch.
    React.useEffect(() => {
        installModalityTracking();
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        const apply = () => setIsFinePointer(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);

    const clearTimers = React.useCallback(() => {
        if (openTimer.current) clearTimeout(openTimer.current);
        if (closeTimer.current) clearTimeout(closeTimer.current);
    }, []);

    React.useEffect(() => clearTimers, [clearTimers]);

    // When force-closed (e.g. the shared menu opened), drop the hover latch so
    // the tip doesn't snap back with no delay the instant the menu closes while
    // the pointer is still over the trigger. `focusing` is left alone — a
    // keyboard user who stays focused should still get the immediate hint.
    React.useEffect(() => {
        if (disabled) {
            clearTimers();
            setHovering(false);
        }
    }, [disabled, clearTimers]);

    const handlePointerEnter = () => {
        if (!isFinePointer) return;
        if (closeTimer.current) clearTimeout(closeTimer.current);
        openTimer.current = setTimeout(() => setHovering(true), openDelay);
    };
    const handlePointerLeave = () => {
        if (openTimer.current) clearTimeout(openTimer.current);
        closeTimer.current = setTimeout(() => setHovering(false), closeDelay);
    };
    // The first press of EITHER a single- or double-click tears the tip down
    // before the trigger's own onClick toggles a menu, so it never overlaps.
    const handlePointerDown = () => {
        clearTimers();
        setHovering(false);
        setFocusing(false);
    };
    const handleFocus = () => {
        // Only keyboard focus reveals the hint — a mouse click also focuses the
        // trigger, and re-popping the tip over an opening menu would be the bug.
        // Use the modality flag (set before focus fires) rather than
        // `:focus-visible`, which isn't applied yet inside the focus event.
        if (lastInputWasKeyboard) {
            clearTimers();
            setFocusing(true);
        }
    };
    const handleBlur = () => {
        clearTimers();
        setFocusing(false);
    };
    // Escape dismisses the focus-revealed tip without moving focus (WCAG 1.4.13).
    // Handled on the focused trigger directly — robust regardless of Radix's
    // dismissal internals (we suppress its focus-outside dismissal below).
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            clearTimers();
            setHovering(false);
            setFocusing(false);
        }
    };

    const effectiveOpen = !disabled && ((isFinePointer && hovering) || focusing);

    const extra: TriggerHandlerProps = {};
    const childProps = children.props as TriggerHandlerProps;
    extra.onPointerEnter = compose(childProps.onPointerEnter, handlePointerEnter);
    extra.onPointerLeave = compose(childProps.onPointerLeave, handlePointerLeave);
    extra.onPointerDown = compose(childProps.onPointerDown, handlePointerDown);
    extra.onFocus = compose(childProps.onFocus, handleFocus);
    extra.onBlur = compose(childProps.onBlur, handleBlur);
    extra.onKeyDown = compose(childProps.onKeyDown, handleKeyDown);
    const trigger = React.cloneElement(children, extra);

    const contentEl = (
        <Popover.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={collisionPadding}
            aria-hidden
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // The tip is aria-hidden + non-focusable, so focus legitimately
            // stays on the trigger (outside the content). Don't let Radix's
            // focus-outside dismissal close a focus-revealed tip; Escape and
            // pointer-down-outside still dismiss.
            onFocusOutside={(e) => e.preventDefault()}
            className={cn(
                TOOLTIP_SURFACE_CLASS,
                TOOLTIP_MOTION_CLASS,
                'pointer-events-none',
                zIndexClassName,
                contentClassName
            )}
        >
            {content}
        </Popover.Content>
    );

    return (
        <Popover.Root
            open={effectiveOpen}
            onOpenChange={(o) => {
                // Radix requests close on Escape / outside interaction — sync our
                // own state so a re-hover re-arms cleanly. We never open via Radix.
                if (!o) {
                    clearTimers();
                    setHovering(false);
                    setFocusing(false);
                }
            }}
            modal={false}
        >
            <Popover.Anchor asChild>{trigger}</Popover.Anchor>
            {portal ? <Popover.Portal>{contentEl}</Popover.Portal> : contentEl}
        </Popover.Root>
    );
}
