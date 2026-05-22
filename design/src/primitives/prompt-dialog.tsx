'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

/**
 * Promise-based replacement for `window.prompt`, in the house design language.
 * Call `prompt({...})`; mount one `<PromptHost />` at the app root (alongside
 * `<ConfirmHost />`). Supports a masked `secret` input, a matching
 * `confirmField` ("choose a passphrase, twice"), and a `validate` hook.
 */

export interface PromptOptions {
    title: string;
    message?: string;
    label?: string;
    placeholder?: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Mask the input. */
    secret?: boolean;
    /** Show a second input that must match the first. Implies validation. */
    confirmField?: boolean;
    /** Minimum accepted length. */
    minLength?: number;
    /** Return an error string to block submission, or null to allow it. */
    validate?: (value: string) => string | null;
}

interface PendingPrompt extends PromptOptions {
    resolve: (value: string | null) => void;
}

const NODE_ENV = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;

let pending: PendingPrompt | null = null;
let notifyHost: (() => void) | null = null;
let hostMountCount = 0;

/** Open a prompt dialog. Resolves to the entered string, or null if cancelled. */
export function prompt(opts: PromptOptions): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
        pending = { ...opts, resolve };
        if (notifyHost) {
            notifyHost();
        } else if (NODE_ENV !== 'production') {
            console.warn('[PromptDialog] prompt() called but no <PromptHost /> is mounted');
        }
    });
}

export function PromptHost() {
    const [state, setState] = useState<PendingPrompt | null>(null);
    const [value, setValue] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const submittingRef = useRef(false);

    useEffect(() => {
        hostMountCount += 1;
        if (hostMountCount > 1 && NODE_ENV !== 'production') {
            console.warn('[PromptDialog] multiple <PromptHost /> instances mounted');
        }
        notifyHost = () => {
            setValue(pending?.defaultValue ?? '');
            setConfirmValue('');
            setError(null);
            setState(pending);
        };
        if (pending) notifyHost();
        return () => {
            hostMountCount -= 1;
            notifyHost = null;
        };
    }, []);

    const close = useCallback(
        (result: string | null) => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            state?.resolve(result);
            pending = null;
            setState(null);
            requestAnimationFrame(() => {
                submittingRef.current = false;
            });
        },
        [state]
    );

    const submit = useCallback(() => {
        if (!state) return;
        const v = value;
        if (state.minLength && v.length < state.minLength) {
            setError(`must be at least ${state.minLength} characters`);
            return;
        }
        if (state.confirmField && v !== confirmValue) {
            setError('the two entries do not match');
            return;
        }
        if (state.validate) {
            const msg = state.validate(v);
            if (msg) {
                setError(msg);
                return;
            }
        }
        close(v);
    }, [state, value, confirmValue, close]);

    if (!state) return null;

    return (
        <Dialog.Root open onOpenChange={(open) => !open && close(null)}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content
                    className="bg-card border-border fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border shadow-lg outline-none"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                >
                    <div className="terminal-title">
                        <span className="text-primary flex items-center gap-1.5">
                            <Pencil className="size-3.5" />
                            {state.title}
                        </span>
                    </div>
                    <div className="space-y-4 p-4 sm:p-5">
                        <Dialog.Title className="sr-only">{state.title}</Dialog.Title>
                        {state.message && (
                            <Dialog.Description asChild>
                                <div className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap">
                                    {state.message}
                                </div>
                            </Dialog.Description>
                        )}
                        <div>
                            {state.label && <Label>{state.label}</Label>}
                            <Input
                                autoFocus
                                type={state.secret ? 'password' : 'text'}
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    setError(null);
                                }}
                                placeholder={state.placeholder}
                                autoComplete="off"
                                spellCheck={false}
                                className={
                                    (state.label ? 'mt-2 ' : '') + (state.secret ? 'font-mono' : '')
                                }
                            />
                        </div>
                        {state.confirmField && (
                            <div>
                                <Label>confirm</Label>
                                <Input
                                    type={state.secret ? 'password' : 'text'}
                                    value={confirmValue}
                                    onChange={(e) => {
                                        setConfirmValue(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="re-enter to confirm"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={'mt-2 ' + (state.secret ? 'font-mono' : '')}
                                />
                            </div>
                        )}
                        {error && <p className="text-destructive font-mono text-xs">{error}</p>}
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => close(null)}
                                className="font-mono text-[11px] tracking-widest uppercase"
                            >
                                {state.cancelLabel ?? 'cancel'}
                            </Button>
                            <Button onClick={submit} className="font-display tracking-wide uppercase">
                                {state.confirmLabel ?? 'ok'}
                            </Button>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
