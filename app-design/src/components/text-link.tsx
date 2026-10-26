import { useRouter } from 'next/compat/router';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { HIT_LINK } from '../lib/hit';

// Padding above and below an inline link grows what a finger can press without moving its line: 24px or more
// at any size, the text's own 1.21em (Inter's ascent and descent) plus what it lacks, and never under 0.25em.
const LINK = 'py-[max(0.25em,calc((24.5px_-_1.21em)/2))] text-foreground underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-foreground';

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * `../README` or `VerifyOk`, as generated pages write them, against the page
 * it is on: `/sdk/stamp-core/README`. The router adds the base path. Outside
 * a router it stays as written.
 */
function useResolved(href: string): string {
    const router = useRouter();
    if (!router || !href || href.startsWith('/') || href.startsWith('#') || href.startsWith('?') || SCHEME.test(href)) return href;
    const here = router.asPath.split(/[?#]/)[0] || '/';
    const url = new URL(href, `https://page.invalid${here}`);
    return url.pathname + url.search + url.hash;
}

/**
 * A link in running text. A page of this site goes through the router, a
 * relative one (`../README`) resolved against the page; an API or a
 * /.well-known file is a plain anchor (the router would try to render it);
 * another site opens in a new tab, and says so to a screen reader.
 */
export function TextLink({
    href: written,
    children,
    external,
    standalone,
    className,
}: {
    href: string;
    children: ReactNode;
    /** Force a new tab (true) or keep it in this one (false). Default: by the address. */
    external?: boolean;
    /** Not part of a sentence (after a "·" in a line of facts): a 44px target to a thumb, its line unchanged. */
    standalone?: boolean;
    className?: string;
}) {
    const href = useResolved(written);
    const internal = href.startsWith('/') && !href.startsWith('/api/') && !href.startsWith('/.well-known/');
    const offsite = external ?? /^https?:\/\//.test(href);
    const look = cn(LINK, standalone && HIT_LINK, className);
    if (internal && !offsite) {
        return (
            <Link href={href} className={look}>
                {children}
            </Link>
        );
    }
    return (
        <a href={href} className={look} {...(offsite ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {children}
            {offsite ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </a>
    );
}
