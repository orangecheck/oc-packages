import { useRouter } from 'next/compat/router';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// Padding above and below an inline link grows what a finger can press (24px at 14px text) without moving its line.
const LINK = 'py-[0.25em] text-foreground underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-foreground';

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
    className,
}: {
    href: string;
    children: ReactNode;
    /** Force a new tab (true) or keep it in this one (false). Default: by the address. */
    external?: boolean;
    className?: string;
}) {
    const href = useResolved(written);
    const internal = href.startsWith('/') && !href.startsWith('/api/') && !href.startsWith('/.well-known/');
    const offsite = external ?? /^https?:\/\//.test(href);
    if (internal && !offsite) {
        return (
            <Link href={href} className={cn(LINK, className)}>
                {children}
            </Link>
        );
    }
    return (
        <a href={href} className={cn(LINK, className)} {...(offsite ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {children}
            {offsite ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </a>
    );
}
