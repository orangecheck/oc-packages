import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '../primitives/button';

export type OcErrorVariant = 'not-found' | 'server-error';

export interface OcErrorPageProps {
    /**
     * Picks the defaults. `not-found` is the 404 shape (primary tone, a "go
     * back" affordance); `server-error` is the 500 shape (destructive tone, a
     * retry affordance and a what-to-do list).
     */
    variant?: OcErrorVariant;
    /** Override the big numeral. Defaults to 404 / 500 from the variant. */
    code?: number | string;
    /** Override the headline. Lowercase, per the family voice. */
    title?: string;
    /** Override the `//` prose line under the headline. */
    detail?: string;
    /**
     * A short "what can you do" list, rendered as the bordered mono panel.
     * Defaults to the server-error list; pass `[]` to suppress it.
     */
    actions?: string[];
    /** Where "go home" points. A site with a app-scoped root can change it. */
    homeHref?: string;
    /** Extra content below the buttons — a report link, a status page, a hint. */
    children?: ReactNode;
    className?: string;
}

const VARIANTS = {
    'not-found': {
        code: 404,
        title: 'no such route',
        detail: "the page you're looking for doesn't exist, or has been moved.",
        tone: 'text-primary',
        label: 'not found',
        actions: [] as string[],
    },
    'server-error': {
        code: 500,
        title: 'internal error',
        detail: 'something went wrong on our end.',
        tone: 'text-destructive',
        label: 'server error',
        actions: [
            'try refreshing the page',
            'wait a few minutes, try again',
            'return home and start over',
        ],
    },
} as const;

/**
 * OcErrorPage — the family's 404 / 500 body.
 *
 * Nine of thirteen family sites had no error page at all and fell through to
 * Next's unstyled default: no header, no footer, no theme, none of the chrome
 * every other page on the site has. It is the one page a visitor is guaranteed
 * to reach eventually, and it was the only one that looked like a different
 * product.
 *
 * Lifted from `oc-attest-web`, which was the only site with a good one. It
 * lives here rather than being copied nine times because a copied page drifts —
 * that is the lesson of the family's `isFamilyUrl` predicate, where 14 of 15
 * hand-copied versions shared a flaw the 15th had already fixed.
 *
 * `Seo` stays with the consumer: the page's title and `noindex` are site
 * concerns and the design package has no business owning them. So a site's
 * `404.tsx` is its `<Seo>` plus `<OcErrorPage variant="not-found" />`.
 *
 * The "go back" button uses `window.history.back()`, which needs a client
 * component — the consumer page carries `'use client'`, as Next requires for
 * any page with an interactive handler.
 */
export function OcErrorPage({
    variant = 'not-found',
    code,
    title,
    detail,
    actions,
    homeHref = '/',
    children,
    className = '',
}: OcErrorPageProps) {
    const v = VARIANTS[variant];
    const shownCode = code ?? v.code;
    const shownActions = actions ?? [...v.actions];
    const isServerError = variant === 'server-error';

    return (
        <div
            className={`container flex min-h-[60vh] flex-col items-center justify-center ${className}`}
        >
            <div className="w-full max-w-xl">
                <div className={`label-mono mb-4 ${v.tone}`}>
                    § {shownCode} // {v.label}
                </div>
                <h1
                    className={`font-display text-7xl font-bold tracking-tight tabular-nums sm:text-8xl ${v.tone}`}
                >
                    {shownCode}
                </h1>
                <h2 className="font-display mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    {title ?? v.title}
                </h2>
                <p className="text-muted-foreground mt-3 font-mono text-xs">
                    {'// '}
                    {detail ?? v.detail}
                </p>

                {shownActions.length > 0 && (
                    <div className="mt-8 border">
                        <div className="border-b px-4 py-2 font-mono text-[11px] tracking-widest uppercase">
                            what can you do
                        </div>
                        <ul className="divide-y font-mono text-xs">
                            {shownActions.map((a) => (
                                <li key={a} className="px-4 py-2">
                                    {'>> '}
                                    {a}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                    <Button asChild className="font-mono">
                        <Link href={homeHref}>
                            <span className="text-[11px] tracking-widest uppercase">go home</span>
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            if (typeof window === 'undefined') return;
                            if (isServerError) window.location.reload();
                            else window.history.back();
                        }}
                        className="font-mono"
                    >
                        <span className="text-[11px] tracking-widest uppercase">
                            {isServerError ? 'retry' : 'go back'}
                        </span>
                    </Button>
                </div>

                {children && <div className="mt-6">{children}</div>}
            </div>
        </div>
    );
}
