'use client';

import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';
import { Button, Input } from '../primitives';

export interface EmailCaptureProps {
    /** Native form action (e.g. a serverless handler or list endpoint). */
    action?: string;
    /** Native form method. */
    method?: string;
    /** Client-side submit handler — preventDefault yourself if intercepting. */
    onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
    /** Input name attribute. */
    name?: string;
    placeholder?: string;
    /** Submit button label. */
    cta?: ReactNode;
    /** Small reassurance line under the row (e.g. "no spam, unsubscribe anytime"). */
    note?: ReactNode;
    /** `onBrand` for placement on a terracotta/dark band. */
    tone?: 'default' | 'onBrand';
    className?: string;
}

/**
 * EmailCapture — the inline waitlist / newsletter row: a pill email field plus a
 * pill submit, with an optional fine-print note. drop it in a hero or footer
 * band; `tone='onBrand'` flips the field translucent + button white for dark
 * brand bands.
 */
export function EmailCapture({
    action,
    method,
    onSubmit,
    name = 'email',
    placeholder = 'you@email.com',
    cta = 'Join the waitlist',
    note,
    tone = 'default',
    className,
}: EmailCaptureProps) {
    const onBrand = tone === 'onBrand';
    return (
        <form action={action} method={method} onSubmit={onSubmit} className={cn(className)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                    type="email"
                    name={name}
                    required
                    placeholder={placeholder}
                    className={cn(
                        'rounded-full text-base md:text-sm',
                        onBrand &&
                            '[background:color-mix(in_oklch,white_18%,transparent)] placeholder:text-primary-foreground/60 border-transparent text-primary-foreground'
                    )}
                />
                <Button
                    type="submit"
                    variant={onBrand ? 'secondary' : 'default'}
                    className={cn(
                        'rounded-full',
                        onBrand && 'bg-background text-foreground hover:bg-background/90'
                    )}
                >
                    {cta}
                </Button>
            </div>
            {note && (
                <p
                    className={cn(
                        'mt-3 text-sm',
                        onBrand ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                >
                    {note}
                </p>
            )}
        </form>
    );
}
