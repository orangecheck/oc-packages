import Link from 'next/link';
import type { ReactNode } from 'react';

import { IsoCheck } from '../brand/iso-check';
import { OCHK_IO, protocolSite, SIGN_IN_LABEL, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { ProductLockup } from './product-lockup';
import { SkipLink } from './site';

/**
 * The page a sign-in happens on: a form column with the lockup, a display
 * title, one line and the ceremony, and from lg an ink column with a picture.
 * The ceremony itself (OcSignIn, a SignMessage, a passkey prompt) is the
 * children; this is only the frame, so ochk.io's /signin and /sudo and every
 * tool's sign-in page look the same.
 */
export function SignInFrame({
    title = SIGN_IN_LABEL,
    lead,
    children,
    error,
    fineprint,
    brand,
    product,
    home,
    protocol,
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
    /** The site's word beside the lockup, as its header has it. Default: the protocol's word. */
    product?: string;
    /**
     * Where the lockup and "Back to home" go. Default: the protocol's page on
     * ochk.io, else ochk.io. An app on its own host whose `/` is its home
     * (ochk.app, vault, chat, cosign) passes `home="/"`.
     */
    home?: string;
    /** The protocol a tool site serves: its `/` redirects off-site, so home is the protocol's page. */
    protocol?: ProtocolSlug;
    /** The link opposite the lockup. Defaults to "Back to home"; `null` leaves it out. */
    back?: ReactNode;
    /** The picture in the ink column. Defaults to the check. */
    art?: ReactNode;
    /** A line at the foot of the ink column. */
    caption?: ReactNode;
    className?: string;
}) {
    const homeHref = home ?? (protocol ? protocolSite(protocol).pageHref : OCHK_IO);
    return (
        <main
            id="main-content"
            className={cn('grid min-h-dvh grid-cols-1 bg-background text-foreground lg:grid-cols-2', className)}
        >
            {/* Past the lockup and "Back to home", straight to the sign-in. */}
            <SkipLink href="#signin">Skip to sign in</SkipLink>
            <section className="flex flex-col px-4 pb-8 pt-5 sm:px-8 lg:px-14 lg:pt-8">
                <header className="flex items-center justify-between gap-4">
                    <Link href={homeHref} className="w-fit rounded-lg">
                        {brand ?? <ProductLockup size={28} product={product ?? (protocol ? protocolSite(protocol).label : undefined)} />}
                        <span className="sr-only"> home</span>
                    </Link>
                    {back === undefined ? (
                        <Link
                            href={homeHref}
                            className="text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            Back to home
                        </Link>
                    ) : (
                        back
                    )}
                </header>
                <div id="signin" tabIndex={-1} className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center gap-9 py-12 outline-none">
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
