import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { familyByGroup, type FamilySite, type FamilySlug } from '../family';
import { cn } from '../lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/overlay';
import { StatusBadge } from '../primitives/status-badge';

function SiteRow({ site, here, onNavigate }: { site: FamilySite; here: boolean; onNavigate?: () => void }) {
    return (
        <li>
            <a
                href={site.href}
                onClick={onNavigate}
                aria-current={here ? 'page' : undefined}
                className={cn(
                    'flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-accent',
                    here && 'bg-muted hover:bg-muted dark:bg-white/[0.06]'
                )}
            >
                <span className="flex items-center gap-2 text-[0.9375rem] font-medium leading-6">
                    {site.label}
                    {site.status !== 'live' ? <StatusBadge status={site.status} /> : null}
                    {here ? <span className="sr-only">(this site)</span> : null}
                </span>
                <span className="text-[0.8125rem] leading-snug text-muted-foreground">{site.line}</span>
            </a>
        </li>
    );
}

/* Where each group sits. On a tablet, two columns: orangecheck over the
   protocols, the apps over the public goods. On a desk, three: orangecheck,
   the protocols, then the apps with the public goods below them, so the panel
   fits a 1280×800 screen without scrolling. Reading order stays orangecheck,
   Protocols, Apps, Public goods. */
const PLACE: Record<string, string> = {
    orangecheck: 'sm:col-start-1 sm:row-start-1 lg:row-span-2',
    protocol: 'sm:col-start-1 sm:row-start-2 lg:col-start-2 lg:row-start-1 lg:row-span-2',
    app: 'sm:col-start-2 sm:row-start-1 lg:col-start-3',
    'public-good': 'sm:col-start-2 sm:row-start-2 lg:col-start-3',
};

/**
 * Every public site in the family, in its groups, one line each. `stack`
 * lays the groups in one column (a phone's menu sheet).
 */
export function FamilyList({
    current,
    onNavigate,
    stack = false,
    className,
}: {
    current?: FamilySlug;
    onNavigate?: () => void;
    stack?: boolean;
    className?: string;
}) {
    const id = useId();
    return (
        <div
            className={cn(
                'grid grid-cols-1 gap-x-2 gap-y-4',
                // The second desk row takes the slack, so the public goods sit right under the apps.
                !stack && 'sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-[auto_1fr]',
                className
            )}
        >
            {familyByGroup().map((g) => (
                <div key={g.id} className={cn('flex flex-col gap-1', !stack && PLACE[g.id])}>
                    <p id={`${id}-${g.id}`} className="px-3 pt-1 text-[0.8125rem] text-muted-foreground">
                        {g.label}
                    </p>
                    <ul aria-labelledby={`${id}-${g.id}`} className="flex flex-col">
                        {g.sites.map((s) => (
                            <SiteRow key={s.slug} site={s} here={s.slug === current} onNavigate={onNavigate} />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

/**
 * The way between the family's sites: a small chevron beside the lockup, so
 * the lockup itself stays a link home. It opens every site, grouped, with a
 * status only where one is not live. `current` marks the site you are on.
 */
export function FamilyMenu({ current, className }: { current?: FamilySlug; className?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                aria-label="All orangecheck sites"
                className={cn(
                    'group inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors',
                    'hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
                    className
                )}
            >
                <ChevronDown aria-hidden className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={14}
                collisionPadding={16}
                className="max-h-[min(40rem,var(--radix-popover-content-available-height))] w-[min(calc(100vw-2rem),42rem)] overflow-y-auto p-3 lg:w-[min(calc(100vw-2rem),56rem)]"
            >
                <FamilyList current={current} onNavigate={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    );
}
