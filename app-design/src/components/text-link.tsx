import Link from 'next/link.js';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

const LINK = 'text-foreground underline decoration-foreground/35 underline-offset-4 transition-colors hover:decoration-foreground';

/**
 * A link in running text. A page of this site goes through the router; an
 * API or a /.well-known file is a plain anchor (the router would try to
 * render it); another site opens in a new tab, and says so to a screen reader.
 */
export function TextLink({
    href,
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
