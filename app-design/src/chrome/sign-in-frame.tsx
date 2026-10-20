import Link from 'next/link.js';
import type { ReactNode } from 'react';

import { IsoCheck } from '../brand/iso-check';
import { Lockup } from '../brand/mark';
import { cn } from '../lib/cn';

/**
 * The page a sign-in happens on: a form column with the lockup, a display
 * title, one line and the ceremony, and from lg an ink column with a picture.
 * The ceremony itself (OcSignIn, a SignMessage, a passkey prompt) is the
 * children; this is only the frame, so ochk.io's /signin and /sudo and every
 * tool's sign-in page look the same.
 */
export function SignInFrame({
    title = 'Sign in',
    lead,
    children,
    error,
    fineprint,
    brand,
    home = '/',
    back,
    art,
    caption,
    className,
}: {
    title?: ReactNode;
    /** One line under the title. */
    lead?: ReactNode;
    /** The ceremony. */
    children: ReactNode;
    /** A failure the ceremony could not show itself. */
    error?: ReactNode;
    /** Small print under the ceremony: where the code goes, what is kept. */
    fineprint?: ReactNode;
    /** Replaces the lockup in the corner. */
    brand?: ReactNode;
    home?: string;
    /** The link opposite the lockup. Defaults to "Back to home"; `null` leaves it out. */
    back?: ReactNode;
    /** The picture in the ink column. Defaults to the check. */
    art?: ReactNode;
    /** A line at the foot of the ink column. */
    caption?: ReactNode;
    className?: string;
}) {
    return (
        <main
            id="main-content"
            className={cn('grid min-h-dvh grid-cols-1 bg-background text-foreground lg:grid-cols-2', className)}
        >
            <section className="flex flex-col px-4 pb-8 pt-5 sm:px-8 lg:px-14 lg:pt-8">
                <header className="flex items-center justify-between gap-4">
                    <Link href={home} className="w-fit rounded-lg">
                        {brand ?? <Lockup size={28} />}
                        <span className="sr-only"> home</span>
                    </Link>
                    {back === undefined ? (
                        <Link
                            href={home}
                            className="text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            Back to home
                        </Link>
                    ) : (
                        back
                    )}
                </header>
                <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center gap-9 py-12">
                    <div className="flex flex-col gap-3">
                        <h1 className="oca-display-2">{title}</h1>
                        {lead ? <p className="oca-lead">{lead}</p> : null}
                    </div>
                    <div>{children}</div>
                    {error ? (
                        <p role="alert" className="text-[0.9375rem] text-destructive">
                            {error}
                        </p>
                    ) : null}
                    {fineprint ? <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{fineprint}</p> : null}
                </div>
            </section>
            <aside
                aria-hidden
                className="relative hidden flex-col justify-between gap-10 overflow-hidden border-l border-[var(--oca-band-line)] bg-oca-ink p-14 text-oca-ink-foreground lg:flex"
            >
                <div className="flex flex-1 items-center justify-center">{art ?? <IsoCheck size={340} settle tilt className="max-w-full" />}</div>
                {caption ? <div className="flex max-w-[24rem] flex-col gap-3">{caption}</div> : null}
            </aside>
        </main>
    );
}
