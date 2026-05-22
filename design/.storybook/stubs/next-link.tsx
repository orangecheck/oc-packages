import * as React from 'react';

type Href = string | { pathname?: string };

/** Storybook stub for next/link — renders a plain anchor (no router needed). */
const Link = React.forwardRef<HTMLAnchorElement, { href: Href; children?: React.ReactNode } & Record<string, unknown>>(
    function Link({ href, children, ...props }, ref) {
        const h = typeof href === 'string' ? href : (href?.pathname ?? '#');
        return (
            <a ref={ref} href={h} {...props}>
                {children}
            </a>
        );
    }
);

export default Link;
