'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from './button';

/**
 * Promise-based replacement for `window.confirm` in the house design language.
 * Call `confirm({...})` from anywhere; a single mounted `<ConfirmHost />` renders
 * it. Async (resolves to a boolean) and provider-less by design.
 */

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void;
}

// Read NODE_ENV without depending on @types/node (this is a browser package).
const NODE_ENV = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;

let pending: PendingConfirm | null = null;
let notifyHost: (() => void) | null = null;
let hostMountCount = 0;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        pending = { ...opts, resolve };
        if (notifyHost) {
            notifyHost();
        } else if (NODE_ENV !== 'production') {
            console.warn('[ConfirmDialog] confirm() called but no <ConfirmHost /> is mounted');
        }
    });
}

/** Singleton dialog host. Mount once at the app root. */
export function ConfirmHost() {
    const [state, setState] = useState<PendingConfirm | null>(null);
    const submittingRef = useRef(false);

    useEffect(() => {
        hostMountCount += 1;
        if (hostMountCount > 1 && NODE_ENV !== 'production') {
            console.warn(
                '[ConfirmDialog] multiple <ConfirmHost /> instances mounted — the last one wins'
            );
        }
        notifyHost = () => setState(pending);
        if (pending) setState(pending);
        return () => {
            hostMountCount -= 1;
            notifyHost = null;
        };
    }, []);

    const close = useCallback(
        (ok: boolean) => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            state?.resolve(ok);
            pending = null;
            setState(null);
            requestAnimationFrame(() => {
                submittingRef.current = false;
            });
        },
        [state]
    );

    if (!state) return null;

    return (
        <Dialog.Root open onOpenChange={(open) => !open && close(false)}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="bg-card border-border fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border shadow-lg outline-none">
                    <div className="terminal-title">
                        <span
                            className={
                                'flex items-center gap-1.5 ' +
                                (state.destructive ? 'text-destructive' : 'text-primary')
                            }
                        >
                            <AlertTriangle className="size-3.5" />
                            {state.title}
                        </span>
                    </div>
                    <div className="space-y-4 p-4 sm:p-5">
                        <Dialog.Title className="sr-only">{state.title}</Dialog.Title>
                        <Dialog.Description asChild>
                            <div className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                                {state.message}
                            </div>
                        </Dialog.Description>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => close(false)}
                                className="font-mono text-[11px] tracking-widest uppercase"
                            >
                                {state.cancelLabel ?? 'cancel'}
                            </Button>
                            <Button
                                onClick={() => close(true)}
                                className={
                                    'font-display tracking-wide uppercase ' +
                                    (state.destructive
                                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                        : '')
                                }
                            >
                                {state.confirmLabel ?? 'confirm'}
                            </Button>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
