import Link from 'next/link';
import type { ReactNode } from 'react';

import { IsoCheck } from '../brand/iso-check';
import { OCHK_IO, protocolSite, SIGN_IN_LABEL, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { HIT_LINK } from '../lib/hit';
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
    homeLink = true,
    protocol,
    back,
    backTo,
    backLabel = 'Go back',
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
    /**
     * `false` draws the lockup without its link and leaves out Back to home: for a sign-in popup, which
     * would leave its opener waiting if it navigated away. A `back` of its own (a Close) still shows.
     */
    homeLink?: boolean;
    /** The protocol a tool site serves: its `/` redirects off-site, so home is the protocol's page. */
    protocol?: ProtocolSlug;
    /** The link opposite the lockup. Defaults to "Back to home"; `null` leaves it out. Wins over `backTo`. */
    back?: ReactNode;
    /**
     * Where the link opposite the lockup goes instead of home: the page the visitor came from, a
     * sign-in's return target. Drawn as Back to home is, a 44px target to a thumb.
     */
    backTo?: string;
    /** That link's words. Default "Go back". */
    backLabel?: string;
    /** The picture in the ink column. Defaults to the check. */
    art?: ReactNode;
    /** A line at the foot of the ink column. */
    caption?: ReactNode;
    className?: string;
}) {
    const homeHref = home ?? (protocol ? protocolSite(protocol).pageHref : OCHK_IO);
    const lockup = brand ?? <ProductLockup size={26} product={product ?? (protocol ? protocolSite(protocol).label : undefined)} />;
    const linkLook = cn('text-[0.9375rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline', HIT_LINK);
    return (
        <main
            id="main-content"
            className={cn('grid min-h-dvh grid-cols-1 bg-background text-foreground lg:grid-cols-2', className)}
        >
            {/* Past the lockup and "Back to home", to what the frame holds: a sign-in, a consent or an error. */}
            <SkipLink href="#signin">Skip to content</SkipLink>
            <section className="flex flex-col px-4 pb-8 pt-5 sm:px-8 lg:px-14 lg:pt-8">
                {/* To a thumb the lockup and Back to home are 44px targets by a ::before, so the header keeps its height. */}
                <header className="flex items-center justify-between gap-4">
                    {homeLink ? (
                        <Link href={homeHref} className={cn('w-fit rounded-none', HIT_LINK)}>
                            {lockup}
                            <span className="sr-only"> home</span>
                        </Link>
                    ) : (
                        <span className="w-fit">{lockup}</span>
                    )}
                    {back !== undefined ? (
                        back
                    ) : backTo ? (
                        // A plain link, as each tool site's own Go back was: the return target may be another family site.
                        <a href={backTo} className={linkLook}>
                            {backLabel}
                        </a>
                    ) : homeLink ? (
                        <Link href={homeHref} className={linkLook}>
                            Back to home
                        </Link>
                    ) : null}
                </header>
                {/* Top-aligned: centred, the title rose by half of whatever the ceremony grew as it mounted. */}
                <div id="signin" tabIndex={-1} className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col gap-9 py-12 outline-none lg:pt-[max(3rem,12vh)]">
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
            {/* One screen tall and pinned: stretched with a form that outgrew the window, the art re-centred lower. */}
            <aside
                aria-hidden
                className="relative hidden flex-col justify-between gap-10 overflow-hidden oca-band-ink border-l border-[var(--oca-band-line)] p-14 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start"
            >
                <div className="flex flex-1 items-center justify-center">{art ?? <IsoCheck size={340} settle tilt className="max-w-full" />}</div>
                {caption ? <div className="flex max-w-[24rem] flex-col gap-3">{caption}</div> : null}
            </aside>
        </main>
    );
}
