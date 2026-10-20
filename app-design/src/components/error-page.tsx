import Link from 'next/link';
import type { ReactNode } from 'react';

import { MarkOutline } from '../brand/mark';
import { OCHK_IO, protocolSite, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { useSiteHome } from '../lib/site-home';
import { Button } from '../primitives/button';
import { Section } from './section';

const WORDS: Record<number, { name: string; title: string; detail: string }> = {
    404: {
        name: 'Not found',
        title: 'This page isn’t here.',
        detail: 'The link may be old, or the address mistyped.',
    },
    500: {
        name: 'Server error',
        title: 'Something broke on our side.',
        detail: 'Try again in a moment.',
    },
};

/**
 * A 404, a 500 or any other error, inside the site's own header and footer:
 * the code, one sentence, one line and a way on. A server error offers a
 * retry as well as the way home. Beside it on a wide screen, the check drawn
 * in hairlines: there, but not filled in.
 */
export function ErrorPage({
    code = 404,
    title,
    detail,
    actions,
    home,
    protocol,
    art,
    className,
}: {
    code?: number;
    title?: ReactNode;
    detail?: ReactNode;
    /** Replaces the default ways on. */
    actions?: ReactNode;
    /** Where "Go home" goes. Default: the protocol's page on ochk.io (inside a ToolShell, its protocol), else ochk.io. */
    home?: string;
    /** The protocol this site serves, when it is not inside a ToolShell. */
    protocol?: ProtocolSlug;
    /** Beside the words from md up. Defaults to the outlined check; `null` leaves it out. */
    art?: ReactNode;
    className?: string;
}) {
    const shellHome = useSiteHome();
    const homeHref = home ?? (protocol ? protocolSite(protocol).pageHref : (shellHome ?? OCHK_IO));
    const words = WORDS[code] ?? (code >= 500 ? WORDS[500]! : WORDS[404]!);
    const server = code >= 500;
    return (
        <Section space="none" className={cn('flex min-h-[min(40rem,72dvh)] items-center py-16 md:py-24', className)}>
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12">
                <div className="flex max-w-[40rem] flex-col items-start gap-6 md:col-span-7">
                    <p className="oca-eyebrow oca-enter">
                        <span className="oca-tabular">{code}</span> · {WORDS[code]?.name ?? (server ? 'Error' : 'Not available')}
                    </p>
                    <h1 className="oca-display-2 oca-enter [--enter-delay:70ms]">{title ?? words.title}</h1>
                    <p className="oca-lead oca-enter [--enter-delay:150ms]">{detail ?? words.detail}</p>
                    <div className="oca-enter flex flex-wrap gap-3 [--enter-delay:230ms]">
                        {actions ?? (
                            <>
                                {server ? <Button onClick={() => window.location.reload()}>Try again</Button> : null}
                                <Button asChild variant={server ? 'secondary' : 'primary'}>
                                    <Link href={homeHref}>Go home</Link>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                {art !== null ? (
                    <div aria-hidden className="oca-enter hidden justify-center md:col-span-5 md:flex [--enter-delay:120ms]">
                        {art ?? <MarkOutline className="w-full max-w-[20rem] text-oca-hairline-strong" />}
                    </div>
                ) : null}
            </div>
        </Section>
    );
}
