/**
 * @orangecheck/legal — minimal inline markup.
 *
 * Authored legal strings stay plain text but may use a tiny, well-bounded
 * markup so emphasis and links survive the data model:
 *   **bold**            → emphasised foreground text
 *   `code`              → monospace
 *   [label](https://…)  → external anchor (new tab)
 *   [label](mailto:…)   → mail anchor
 *   [label](/path)      → internal anchor
 *
 * Links are plain `<a>` elements — legal pages are not perf-sensitive, and
 * avoiding `next/link` keeps this package free of a Next peer dependency.
 */

import React from 'react';

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function renderInline(text: string): React.ReactNode {
    const parts = text.split(INLINE_RE);
    return parts.map((part, i) => {
        if (!part) return null;

        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={i} className="text-foreground font-semibold">
                    {part.slice(2, -2)}
                </strong>
            );
        }

        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={i} className="font-mono text-[0.95em]">
                    {part.slice(1, -1)}
                </code>
            );
        }

        const link = LINK_RE.exec(part);
        if (link) {
            const label = link[1] ?? '';
            const href = link[2] ?? '';
            const external = /^https?:\/\//.test(href);
            return (
                <a
                    key={i}
                    href={href}
                    className="text-primary underline"
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                    {label}
                </a>
            );
        }

        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}
