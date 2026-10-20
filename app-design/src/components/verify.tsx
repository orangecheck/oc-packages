import { CircleCheck, CircleDashed, CircleMinus, CircleX, Clock } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Field, Textarea } from '../primitives/form';
import { StatusBadge, type Statement } from '../primitives/status-badge';
import { CodeBlock } from './code-block';
import { KeyValueList, type KeyValueItem } from './data';

export type CheckState = 'ok' | 'fail' | 'pending' | 'skipped' | 'unchecked';

export interface VerifyCheck {
    label: ReactNode;
    state: CheckState;
    /** What was found, in a line: the block, the address, why it failed. */
    note?: ReactNode;
}

const CHECK: Record<CheckState, { word: string; icon: ReactNode; tone: string }> = {
    ok: { word: 'Passed', icon: <CircleCheck />, tone: 'text-success' },
    fail: { word: 'Failed', icon: <CircleX />, tone: 'text-destructive' },
    pending: { word: 'Pending', icon: <Clock />, tone: 'text-oca-accent-ink' },
    skipped: { word: 'Skipped', icon: <CircleMinus />, tone: 'text-muted-foreground' },
    unchecked: { word: 'Not checked', icon: <CircleDashed />, tone: 'text-oca-subtle' },
};

/**
 * What a check on an artifact found: the statement (good, caution or
 * refused) with a title and one line, each check and its result in words,
 * the facts read from the artifact, and what this check did not cover. One
 * shape for a stamp, a ballot, an envelope, a delegation or a pledge.
 */
export function VerifyReport({
    verdict,
    title,
    summary,
    checks,
    facts,
    notChecked,
    actions,
    className,
}: {
    verdict: Statement;
    title: ReactNode;
    /** One line under the title. */
    summary?: ReactNode;
    checks: VerifyCheck[];
    facts?: KeyValueItem[];
    /** "What this did not check": every verb has something it cannot see. */
    notChecked?: ReactNode[];
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <section
            aria-label="Verification result"
            className={cn('overflow-hidden rounded-[1.25rem] border border-border bg-card', className)}
        >
            <header className="flex flex-col items-start gap-3 p-6 md:p-8">
                <StatusBadge status={verdict} />
                <h3 className="oca-display-3">{title}</h3>
                {summary ? <p className="oca-body max-w-[40rem]">{summary}</p> : null}
            </header>
            <ul aria-label="Checks" className="divide-y divide-border border-t border-border">
                {checks.map((c, i) => {
                    const k = CHECK[c.state];
                    return (
                        <li key={i} className="flex items-start gap-3 px-6 py-3.5 md:px-8">
                            <span aria-hidden className={cn('mt-0.5 shrink-0 [&_svg]:size-[1.125rem]', k.tone)}>
                                {k.icon}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <span className="text-[0.9375rem]">{c.label}</span>
                                    {c.note ? (
                                        <span className="break-words text-[0.8125rem] leading-snug text-muted-foreground">{c.note}</span>
                                    ) : null}
                                </div>
                                <span
                                    className={cn(
                                        'shrink-0 text-[0.8125rem]',
                                        c.state === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                                    )}
                                >
                                    {k.word}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
            {facts && facts.length > 0 ? (
                <KeyValueList items={facts} className="rounded-none border-x-0 border-b-0 bg-transparent [&>div]:px-6 md:[&>div]:px-8" />
            ) : null}
            {notChecked && notChecked.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-border bg-muted/50 px-6 py-5 md:px-8">
                    <p className="text-[0.875rem] font-medium">What this did not check</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.875rem] leading-relaxed text-muted-foreground">
                        {notChecked.map((n, i) => (
                            <li key={i}>{n}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {actions ? <div className="flex flex-wrap gap-3 border-t border-border px-6 py-5 md:px-8">{actions}</div> : null}
        </section>
    );
}

/**
 * Sign a message with a Bitcoin address: a browser wallet signs it with one
 * press where there is one (`wallets`, the buttons a site renders), and any
 * wallet can sign the message by hand and paste the signature back. The
 * frame for sign-in by wallet, /sudo, and every tool's signing step.
 */
export function SignMessage({
    lead,
    address,
    message,
    wallets,
    busy = false,
    error,
    submitLabel = 'Confirm',
    secondary,
    onSignature,
    className,
}: {
    lead?: ReactNode;
    /** The address that must sign. */
    address: string;
    message: string;
    /** Buttons that sign with a browser wallet. */
    wallets?: ReactNode;
    busy?: boolean;
    /** Why the last signature was refused. */
    error?: ReactNode;
    submitLabel?: string;
    /** Beside the submit button: Back, Cancel. */
    secondary?: ReactNode;
    onSignature: (signature: string) => void;
    className?: string;
}) {
    const [pasted, setPasted] = useState('');
    return (
        <div className={cn('flex flex-col gap-5', className)}>
            {lead ? <p className="text-[0.9375rem] leading-relaxed">{lead}</p> : null}
            {wallets ? (
                <>
                    <div className="flex flex-wrap gap-2">{wallets}</div>
                    <div className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        or sign it in any wallet
                        <span className="h-px flex-1 bg-border" />
                    </div>
                </>
            ) : null}
            <CodeBlock code={message} caption="Message to sign" />
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pasted.trim()) onSignature(pasted.trim());
                }}
            >
                <Field
                    label="Signature"
                    error={error}
                    hint={
                        <>
                            From your wallet&rsquo;s &ldquo;sign message&rdquo; (BIP-322), signed by{' '}
                            <span className="break-all font-mono">{address}</span>.
                        </>
                    }
                >
                    <Textarea
                        value={pasted}
                        onChange={(e) => setPasted(e.target.value)}
                        rows={3}
                        spellCheck={false}
                        className="min-h-24 font-mono text-base md:text-[0.8125rem]"
                    />
                </Field>
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" loading={busy} disabled={!pasted.trim()}>
                        {submitLabel}
                    </Button>
                    {secondary}
                </div>
            </form>
        </div>
    );
}
