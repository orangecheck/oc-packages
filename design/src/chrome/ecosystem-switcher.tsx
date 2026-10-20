import { Boxes, Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useMenu } from '../tokens/use-menu';
import { FAMILY_PROPERTIES } from './family-properties';

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
    | 'me'
    | 'vault'
    | 'chat'
    | 'cosign'
    | 'btc'
    | 'globe'
    | 'attest'
    | 'lock'
    | 'vote'
    | 'stamp'
    | 'agent'
    | 'pledge'
    | 'analytics'
    | 'bot'
    | 'forge';

// Read from the registry, so the switcher and the logo menu cannot disagree.
const ENTRIES = FAMILY_PROPERTIES.filter((p) => p.category !== 'owner');

/** Entries gated behind `showOwnerEntries={true}`: the owner-only properties,
 *  invisible to everyone except verified owners (the JWT claim drives it). */
const OWNER_ENTRIES = FAMILY_PROPERTIES.filter((p) => p.category === 'owner');

export interface EcosystemSwitcherProps {
    current: EcosystemSlug;
    className?: string;
    /**
     * When true, append the owner-only entries (currently
     * `oc·analytics`) to the family-switcher dropdown. Consumers
     * pass this from their session: `useOcSession().account?.isOwner`.
     * Defaults to false so non-owners never see owner-only links.
     *
     * Not a security boundary — analytics.ochk.io re-checks the
     * live OWNER_OC_ADDRESSES env on every request. This prop only
     * decides whether the UX hint is visible.
     */
    showOwnerEntries?: boolean;
}

export function EcosystemSwitcher({
    current,
    className,
    showOwnerEntries = false,
}: EcosystemSwitcherProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useMenu(open, setOpen, containerRef);

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
                        {[...ENTRIES, ...(showOwnerEntries ? OWNER_ENTRIES : [])].map((e) => {
                            const isActive = e.slug === current;
                            return (
                                <li key={e.slug}>
                                    <Link
                                        href={e.origin}
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
                            href="https://ochk.io/docs"
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground inline-block transition-colors"
                        >
                            ochk.io/docs →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
