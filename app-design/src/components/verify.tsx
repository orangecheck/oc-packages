import { CircleCheck, CircleDashed, CircleMinus, CircleSlash, CircleX, Clock } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Spinner } from '../primitives/feedback';
import { Field, Textarea } from '../primitives/form';
import { StatusBadge, type Statement } from '../primitives/status-badge';
import { CodeBlock } from './code-block';
import { KeyValueList, type KeyValueItem } from './data';

/**
 * `none`: there is nothing to check, and that is a fact (no timestamp yet, no
 * stake bound). `unchecked`: there may be, but this check did not look.
 * `running`: the check is under way, in a verifier that runs in the page.
 */
export type CheckState = 'ok' | 'fail' | 'pending' | 'none' | 'skipped' | 'unchecked' | 'running';

export interface VerifyCheck {
    label: ReactNode;
    state: CheckState;
    /** What was found, in a line: the block, the address, why it failed. */
    note?: ReactNode;
    /** What does not fit in a line, such as the check's own output behind a disclosure: on a line of its own. */
    output?: ReactNode;
}

const CHECK: Record<CheckState, { word: string; icon: ReactNode; tone: string }> = {
    ok: { word: 'Passed', icon: <CircleCheck />, tone: 'text-success' },
    fail: { word: 'Failed', icon: <CircleX />, tone: 'text-destructive' },
    pending: { word: 'Pending', icon: <Clock />, tone: 'text-oca-accent-ink' },
    none: { word: 'None', icon: <CircleSlash />, tone: 'text-muted-foreground' },
    skipped: { word: 'Skipped', icon: <CircleMinus />, tone: 'text-muted-foreground' },
    unchecked: { word: 'Not checked', icon: <CircleDashed />, tone: 'text-oca-subtle' },
    running: { word: 'Running', icon: <Spinner />, tone: 'text-foreground' },
};

/**
 * What a check on an artifact found: the statement (good, caution or
 * refused) with a title and one line, each check and its result in words,
 * the facts read from the artifact, and what this check did not cover. One
 * shape for a stamp, a ballot, an envelope, a delegation or a pledge, and for
 * a check that runs in the page: its checks run one by one, and the statement
 * comes once they have.
 */
export function VerifyReport({
    verdict,
    title,
    summary,
    checks,
    facts,
    notChecked,
    actions,
    as: Heading = 'h2',
    className,
}: {
    /** Left out until there is one: a check that has not run yet, or is running. */
    verdict?: Statement;
    title: ReactNode;
    /** One line under the title. */
    summary?: ReactNode;
    checks: VerifyCheck[];
    facts?: KeyValueItem[];
    /** "What this did not check": every verb has something it cannot see. */
    notChecked?: ReactNode[];
    /** Under everything: what to do next, or the controls of a check that runs in the page. */
    actions?: ReactNode;
    /** The title's level: h2 under the page's title (the default), h3 inside a section. */
    as?: 'h2' | 'h3';
    className?: string;
}) {
    return (
        <section
            aria-label="Verification result"
            className={cn('overflow-hidden rounded-none border border-border bg-card', className)}
        >
            {/* items-start sizes each line to its longest word: a Bitcoin address must be free to break. */}
            <header className="flex flex-col items-start gap-3 p-6 md:p-8">
                {verdict ? <StatusBadge status={verdict} /> : null}
                {/* A step under the page's H1 (PageHeader's display-3): the verdict reads as a section. */}
                <Heading className="oca-title [overflow-wrap:anywhere] md:text-[1.5rem]">{title}</Heading>
                {summary ? <p className="oca-body max-w-[40rem] [overflow-wrap:anywhere]">{summary}</p> : null}
            </header>
            <ul aria-label="Checks" className="divide-y divide-border border-t border-border">
                {checks.map((c, i) => {
                    const k = CHECK[c.state];
                    return (
                        <li key={i} className="flex items-start gap-3 px-6 py-3.5 md:px-8">
                            <span aria-hidden className={cn('mt-0.5 shrink-0 [&_svg]:size-[1.125rem]', k.tone)}>
                                {k.icon}
                            </span>
                            {/* A check's output takes a line of its own, under the label and the result. */}
                            <div
                                className={cn(
                                    'flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6',
                                    c.output ? 'sm:flex-wrap sm:gap-y-0.5' : null
                                )}
                            >
                                {/* With output the row wraps, so the label column takes what the result leaves, never the whole line. */}
                                <div className={cn('flex min-w-0 flex-col gap-0.5', c.output ? 'sm:flex-1' : null)}>
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
                                {c.output ? <div className="min-w-0 pt-1 sm:basis-full">{c.output}</div> : null}
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

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** SignMessage's wallet slot: the buttons, or a function given `take` for the signature a wallet hands back. */
export type SignMessageWallets = ReactNode | ((take: (signature: string) => void) => ReactNode);

/**
 * Sign a message with a Bitcoin address: a browser wallet signs it with one
 * press where there is one (`wallets`, the buttons a site renders), and any
 * wallet can sign the message by hand and paste the signature back. The
 * frame for sign-in by wallet, /sudo, and every tool's signing step.
 *
 * One signature at a time: while `onSignature`'s promise is pending, or
 * `busy` is set, the paste submit waits and the wallet buttons are disabled;
 * while a wallet signs (its button marks itself `aria-busy`), the paste
 * submit waits too. A wallet's signature joins that rule when the slot is a
 * function and the buttons hand it to `take`; one that comes while held is
 * not used, and SignMessage says so under the wallet row until the hold ends. `error` is said
 * under the way in that led to it: the wallet row after a wallet press or a
 * signature from `take`, the paste field after a pasted one. A signature
 * that comes after SignMessage has left the page is not used.
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
    scheme = 'bip322',
    onSignature,
    className,
}: {
    lead?: ReactNode;
    /** The address that must sign. */
    address: string;
    message: string;
    /** Buttons that sign with a browser wallet, or a function that hands them `take`. */
    wallets?: SignMessageWallets;
    /** Holds both ways in, as while the site checks or sends what was signed. */
    busy?: boolean;
    /** Why the last signature was refused, or why the wallet did not sign. A new node is a new error: pass a string. */
    error?: ReactNode;
    submitLabel?: string;
    /** Beside the submit button: Back, Cancel. */
    secondary?: ReactNode;
    /** The signature the wallet is asked for: BIP-322, or a legacy (BIP-137) one. The hint names it. */
    scheme?: 'bip322' | 'legacy';
    /**
     * Given each signature once. Until a promise it returns settles, no other
     * signature is taken. If you handle a rejection, return the handled promise
     * (`p.catch(show)`), not `p`, or it is also reported as unhandled.
     */
    onSignature: (signature: string) => void | PromiseLike<unknown>;
    className?: string;
}) {
    const [pasted, setPasted] = useState('');
    const [taking, setTaking] = useState(false);
    const [walletSigning, setWalletSigning] = useState(false);
    // A wallet's signature that came while held: the person approved it, so say it was not used.
    const [dropped, setDropped] = useState(false);
    // The way in last used, and where the error now shown was said: it stays put until it changes.
    const [way, setWay] = useState<'wallet' | 'paste'>('paste');
    const [said, setSaid] = useState<{ error: ReactNode; at: 'wallet' | 'paste' }>({ error, at: 'paste' });
    if (said.error !== error) setSaid({ error, at: way });
    // Read and set in the same tick, so two presses before a render take one signature.
    const held = useRef(false);
    // A wallet answers through the take of the render it was pressed in, whose busy is stale.
    const busyNow = useRef(busy);
    useCommitEffect(() => {
        busyNow.current = busy;
    }, [busy]);
    // A wallet prompt left open after SignMessage leaves the page answers into nothing.
    const live = useRef(false);
    useCommitEffect(() => {
        live.current = true;
        return () => {
            live.current = false;
        };
    }, []);
    const slot = useRef<HTMLFieldSetElement>(null);
    const hold = busy || taking;
    // Once the hold ends, what was held has been used or refused, and the notice has nothing left to say.
    const [wasHeld, setWasHeld] = useState(hold);
    if (wasHeld !== hold) {
        setWasHeld(hold);
        if (!hold) setDropped(false);
    }

    function take(signature: string, via: 'wallet' | 'paste') {
        if (!live.current) return;
        if (held.current || busyNow.current) {
            if (via === 'wallet') setDropped(true);
            return;
        }
        held.current = true;
        setTaking(true);
        setDropped(false);
        setWay(via);
        setSaid((s) => ({ ...s, at: via }));
        const release = () => {
            held.current = false;
            setTaking(false);
        };
        let done: void | PromiseLike<unknown>;
        try {
            done = onSignature(signature);
        } catch (e) {
            release();
            throw e;
        }
        // A rejection is still the site's to handle, as before SignMessage waited on it.
        if (done && typeof done.then === 'function') void Promise.resolve(done).finally(release);
        else release();
    }

    const slotted = typeof wallets === 'function' ? wallets((signature) => take(signature, 'wallet')) : wallets;
    const hasSlot = Boolean(slotted);
    const at = hasSlot && (said.error === error ? said.at : way) === 'wallet' ? 'wallet' : 'paste';
    useEffect(() => {
        const el = slot.current;
        if (!el || typeof MutationObserver === 'undefined') return;
        const read = () => {
            const signing = el.querySelector('[aria-busy="true"]') !== null;
            setWalletSigning(signing);
            if (signing) {
                setWay('wallet');
                setDropped(false);
            }
        };
        read();
        const watch = new MutationObserver(read);
        watch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
        return () => {
            watch.disconnect();
            setWalletSigning(false);
        };
    }, [hasSlot]);

    return (
        <div className={cn('flex flex-col gap-5', className)}>
            {lead ? <p className="text-[0.9375rem] leading-relaxed">{lead}</p> : null}
            {hasSlot ? (
                <>
                    {/* SignMessage leads with its own words, so a wallet button's heading stays out. Wrapped, the
                        buttons' 44px targets stand clear of each other to a thumb. Held, the row dims: the adapter
                        dims only for its own state. */}
                    <div className="flex flex-col gap-2">
                        <div className={cn('flex flex-wrap gap-2 [--oc-wallet-heading:none] pointer-coarse:gap-y-3', hold && 'opacity-50')}>
                            <fieldset ref={slot} disabled={hold} className="contents">
                                {slotted}
                            </fieldset>
                        </div>
                        {at === 'wallet' && error ? (
                            <p role="alert" className="text-[0.8125rem] leading-snug text-destructive">
                                {error}
                            </p>
                        ) : null}
                        {dropped ? (
                            <p role="alert" className="text-[0.8125rem] leading-snug text-destructive">
                                Your wallet signed while the page was busy, so that signature was not used.
                            </p>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        or sign it in any wallet
                        <span className="h-px flex-1 bg-border" />
                    </div>
                </>
            ) : null}
            {/* A message is exact bytes and often one long id: it wraps here, and the copy keeps every byte. */}
            <CodeBlock code={message} caption="Message to sign" wrap />
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (pasted.trim() && !walletSigning) take(pasted.trim(), 'paste');
                }}
            >
                <Field
                    label="Signature"
                    error={at === 'paste' ? error : undefined}
                    hint={
                        <>
                            From your wallet&rsquo;s &ldquo;sign message&rdquo; ({scheme === 'legacy' ? 'legacy, BIP-137' : 'BIP-322'}), signed by{' '}
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
                    <Button type="submit" loading={hold} disabled={!pasted.trim() || walletSigning}>
                        {submitLabel}
                    </Button>
                    {secondary}
                </div>
                {walletSigning ? (
                    <p className="text-[0.8125rem] text-muted-foreground">A wallet is signing. Cancel it there to paste a signature instead.</p>
                ) : null}
            </form>
        </div>
    );
}
