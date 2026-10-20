import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';

import { Button } from './button';
import { Field, Input } from './form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './overlay';

/*
 * Ask and wait: `await confirm({...})` is true or false, `await prompt({...})`
 * is the text or null. Mount <DialogHost /> once, near the root; every call
 * queues there and they open one at a time. Without a host nothing is asked
 * and the answer is no (false, null), never a silent yes.
 */

export interface ConfirmOptions {
    title: ReactNode;
    /** One or two sentences: what happens, and whether it can be undone. */
    message?: ReactNode;
    /** The verb on the button: "Revoke", "Delete stamp". Defaults to "Continue". */
    confirmLabel?: string;
    cancelLabel?: string;
    /** The red button, for what cannot be undone. */
    destructive?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
    label?: ReactNode;
    placeholder?: string;
    defaultValue?: string;
    hint?: ReactNode;
    /** A password field: hidden as typed, never filled in by the browser. */
    secret?: boolean;
    minLength?: number;
    /** Return a sentence to refuse the value, or nothing to take it. */
    validate?: (value: string) => string | null | undefined;
    /** Ask for it twice (a passphrase): `true`, or the second field's label. Refuses until the two match. */
    confirmField?: boolean | ReactNode;
}

type Ask =
    | { id: number; kind: 'confirm'; options: ConfirmOptions; settle: (answer: boolean) => void }
    | { id: number; kind: 'prompt'; options: PromptOptions; settle: (answer: string | null) => void };

let queue: Ask[] = [];
let asked = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ask(item: Ask) {
    queue = [...queue, { ...item, id: ++asked }];
    emit();
}

function done() {
    queue = queue.slice(1);
    emit();
}

/** Ask a yes-or-no question. True only when the person presses the confirm button. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
    if (hosts === 0) {
        console.error('confirm(): no <DialogHost /> is mounted, so nothing was asked; treating it as no.');
        return Promise.resolve(false);
    }
    return new Promise((resolve) => ask({ id: 0, kind: 'confirm', options, settle: resolve }));
}

/** Ask for a line of text. The text, or null when the person cancels. */
export function prompt(options: PromptOptions): Promise<string | null> {
    if (hosts === 0) {
        console.error('prompt(): no <DialogHost /> is mounted, so nothing was asked; treating it as cancelled.');
        return Promise.resolve(null);
    }
    return new Promise((resolve) => ask({ id: 0, kind: 'prompt', options, settle: resolve }));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    hosts++;
    return () => {
        listeners.delete(listener);
        hosts--;
    };
}

const current = () => queue[0] ?? null;
const none = () => null;

function PromptBody({ ask: a }: { ask: Extract<Ask, { kind: 'prompt' }> }) {
    const o = a.options;
    const [value, setValue] = useState(o.defaultValue ?? '');
    const [again, setAgain] = useState('');
    const [error, setError] = useState<ReactNode>(null);
    const [mismatch, setMismatch] = useState(false);
    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (o.minLength && value.length < o.minLength) {
            setError(`At least ${o.minLength} characters.`);
            return;
        }
        const refused = o.validate?.(value);
        if (refused) {
            setError(refused);
            return;
        }
        if (o.confirmField && again !== value) {
            setMismatch(true);
            return;
        }
        a.settle(value);
        done();
    };
    return (
        <form onSubmit={submit} noValidate>
            <Field label={o.label ?? 'Your answer'} hint={o.hint} error={error}>
                <Input
                    autoFocus
                    type={o.secret ? 'password' : 'text'}
                    autoComplete={o.secret ? 'new-password' : 'off'}
                    placeholder={o.placeholder}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setError(null);
                        setMismatch(false);
                    }}
                />
            </Field>
            {o.confirmField ? (
                <Field
                    label={o.confirmField === true ? 'Type it again' : o.confirmField}
                    error={mismatch ? 'The two do not match.' : null}
                    className="mt-4"
                >
                    <Input
                        type={o.secret ? 'password' : 'text'}
                        autoComplete={o.secret ? 'new-password' : 'off'}
                        value={again}
                        onChange={(e) => {
                            setAgain(e.target.value);
                            setMismatch(false);
                        }}
                    />
                </Field>
            ) : null}
            <DialogFooter>
                <Button
                    variant="secondary"
                    onClick={() => {
                        a.settle(null);
                        done();
                    }}
                >
                    {o.cancelLabel ?? 'Cancel'}
                </Button>
                <Button type="submit" variant={o.destructive ? 'danger' : 'primary'}>
                    {o.confirmLabel ?? 'Continue'}
                </Button>
            </DialogFooter>
        </form>
    );
}

/** Where confirm() and prompt() open. Mount it once. */
export function DialogHost() {
    const a = useSyncExternalStore(subscribe, current, none);
    const cancel = () => {
        if (!a) return;
        if (a.kind === 'confirm') a.settle(false);
        else a.settle(null);
        done();
    };
    return (
        <Dialog open={a !== null} onOpenChange={(open) => (open ? undefined : cancel())}>
            {a ? (
                <DialogContent
                    // A question that needs an answer before anything else happens.
                    role="alertdialog"
                    // With no message there is nothing to describe it; say so, or Radix warns.
                    {...(a.options.message ? {} : { 'aria-describedby': undefined })}
                    className="w-[min(92vw,28rem)]"
                >
                    <DialogHeader>
                        <DialogTitle>{a.options.title}</DialogTitle>
                        {a.options.message ? <DialogDescription>{a.options.message}</DialogDescription> : null}
                    </DialogHeader>
                    {a.kind === 'prompt' ? (
                        // Keyed by the ask, so a second prompt starts empty.
                        <PromptBody key={a.id} ask={a} />
                    ) : (
                        <DialogFooter>
                            <Button variant="secondary" onClick={cancel}>
                                {a.options.cancelLabel ?? 'Cancel'}
                            </Button>
                            <Button
                                variant={a.options.destructive ? 'danger' : 'primary'}
                                onClick={() => {
                                    a.settle(true);
                                    done();
                                }}
                            >
                                {a.options.confirmLabel ?? 'Continue'}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            ) : null}
        </Dialog>
    );
}
