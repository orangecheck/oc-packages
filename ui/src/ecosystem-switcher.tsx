import { Boxes, Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * EcosystemSwitcher — cross-product dropdown for jumping between every
 * site in the OrangeCheck family. Drop one into every site's LayoutHeader
 * and mark the active site via the `current` prop.
 *
 *   <EcosystemSwitcher current="lock" />
 *
 * The component is dependency-self-contained: no Radix, no Headless UI,
 * just outside-click + Escape handling so it works identically in every
 * site without forcing a peer-dep upgrade. Every link stays in-tab — the
 * family is one app from the user's POV.
 */

export type EcosystemSlug =
    | 'home'
    | 'docs'
    | 'fleet'
    | 'attest'
    | 'lock'
    | 'vote'
    | 'stamp'
    | 'agent'
    | 'pledge';

interface SwitcherEntry {
    slug: EcosystemSlug;
    href: string;
    label: string;
    sub: string;
    docsHref: string;
}

const ENTRIES: SwitcherEntry[] = [
    {
        slug: 'home',
        href: 'https://ochk.io',
        label: 'orangecheck',
        sub: 'umbrella',
        docsHref: 'https://docs.ochk.io',
    },
    {
        slug: 'docs',
        href: 'https://docs.ochk.io',
        label: 'oc·docs',
        sub: 'unified docs',
        docsHref: 'https://docs.ochk.io',
    },
    {
        slug: 'fleet',
        href: 'https://fleet.ochk.io',
        label: 'oc·fleet',
        sub: 'managed — agent fleet',
        docsHref: 'https://docs.ochk.io/fleet',
    },
    {
        slug: 'attest',
        href: 'https://attest.ochk.io',
        label: 'oc·attest',
        sub: 'am — sybil resistance',
        docsHref: 'https://docs.ochk.io/attest',
    },
    {
        slug: 'lock',
        href: 'https://lock.ochk.io',
        label: 'oc·lock',
        sub: 'whisper — encryption',
        docsHref: 'https://docs.ochk.io/lock',
    },
    {
        slug: 'vote',
        href: 'https://vote.ochk.io',
        label: 'oc·vote',
        sub: 'decide — polls',
        docsHref: 'https://docs.ochk.io/vote',
    },
    {
        slug: 'stamp',
        href: 'https://stamp.ochk.io',
        label: 'oc·stamp',
        sub: 'declare — block-anchored',
        docsHref: 'https://docs.ochk.io/stamp',
    },
    {
        slug: 'agent',
        href: 'https://agent.ochk.io',
        label: 'oc·agent',
        sub: 'delegate — scoped auth',
        docsHref: 'https://docs.ochk.io/agent',
    },
    {
        slug: 'pledge',
        href: 'https://pledge.ochk.io',
        label: 'oc·pledge',
        sub: 'swear — bonded commitment',
        docsHref: 'https://docs.ochk.io/pledge',
    },
];

export interface EcosystemSwitcherProps {
    current: EcosystemSlug;
    className?: string;
}

export function EcosystemSwitcher({
    current,
    className,
}: EcosystemSwitcherProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Outside-click + Escape close.
    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={containerRef} className={'relative ' + (className ?? '')}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Switch OrangeCheck product"
                title="Switch product"
                onClick={() => setOpen((v) => !v)}
                className={
                    'inline-flex items-center gap-1 px-2 py-1 transition-colors ' +
                    (open
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground')
                }
            >
                <Boxes className="h-4 w-4" />
                <ChevronDown
                    className={
                        'h-3.5 w-3.5 transition-transform ' + (open ? 'rotate-180' : '')
                    }
                />
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Switch OrangeCheck product"
                    className="bg-background absolute right-0 top-full z-[60] mt-2 w-72 border shadow-lg"
                >
                    <div className="label-mono text-primary border-b px-4 py-2">
                        § the family
                    </div>
                    <ul className="py-1">
                        {ENTRIES.map((e) => {
                            const isActive = e.slug === current;
                            return (
                                <li key={e.slug}>
                                    <Link
                                        href={e.href}
                                        onClick={() => setOpen(false)}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={
                                            'group flex items-baseline gap-3 px-4 py-2 transition-colors ' +
                                            (isActive
                                                ? 'bg-primary/5'
                                                : 'hover:bg-muted')
                                        }
                                    >
                                        <span
                                            className={
                                                'font-display flex-1 text-[12px] font-semibold tracking-tight ' +
                                                (isActive
                                                    ? 'text-primary'
                                                    : 'text-foreground group-hover:text-primary transition-colors')
                                            }
                                        >
                                            {e.label}
                                        </span>
                                        <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                                            {e.sub}
                                        </span>
                                        {isActive && (
                                            <Check className="text-primary h-3 w-3" />
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="border-t px-4 py-2 font-mono text-[10px] tracking-widest uppercase">
                        <Link
                            href="https://docs.ochk.io"
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground inline-block transition-colors"
                        >
                            docs.ochk.io →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
