import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import Link from 'next/link';
import { createContext, useContext, useId, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';

/* Parts a signed-in page repeats: a block's title, a list in a card, its rows, a choice between cards. */

/* ── SectionTitle ────────────────────────────────────────────────────── */

/**
 * A block's title on a signed-in page or a tool: the name, a count or state
 * after it, one line under it, and an action at the right. On a phone a
 * button or a link stays beside the title, level with it; only a group too
 * wide to share the row wraps under the text. Public pages use
 * SectionHeading, at display size.
 */
export function SectionTitle({
    title,
    meta,
    description,
    action,
    as: Tag = 'h2',
    size = 'md',
    tone = 'default',
    id,
    className,
}: {
    title: ReactNode;
    /** A count or a state after the title: "12 of 40". */
    meta?: ReactNode;
    description?: ReactNode;
    /** A link or buttons for the block: "View all", "Add". */
    action?: ReactNode;
    as?: 'h2' | 'h3';
    /** `sm` for a group inside a pane or a card. */
    size?: 'md' | 'sm';
    /** `danger` for a block whose actions cannot be undone. */
    tone?: 'default' | 'danger';
    /** The heading's id, for a link to the block. */
    id?: string;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3 sm:items-end', className)}>
            <div className="flex min-w-0 max-w-[40rem] flex-[1_1_10rem] flex-col gap-1">
                <Tag
                    id={id}
                    className={cn(
                        'flex scroll-mt-24 flex-wrap items-baseline gap-x-3',
                        size === 'sm' ? 'oca-title-sm' : 'oca-title',
                        tone === 'danger' && 'text-destructive'
                    )}
                >
                    {title}
                    {meta ? <span className="oca-tabular text-[0.875rem] font-normal tracking-normal text-muted-foreground">{meta}</span> : null}
                </Tag>
                {description ? <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</p> : null}
            </div>
            {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
    );
}

/* ── ListCard ────────────────────────────────────────────────────────── */

/**
 * Rows in one card, a hairline between each: conversations, keys, backers.
 * The card clips to its corners, so a row's hover fill and inset focus ring
 * stay inside it.
 */
export function ListCard({
    as: Tag = 'ul',
    className,
    ...props
}: HTMLAttributes<HTMLElement> & { as?: 'ul' | 'ol' | 'div' }) {
    return <Tag data-oca-list="" className={cn('divide-y divide-border overflow-clip rounded-[1.25rem] border border-border bg-card', className)} {...props} />;
}

/* ── ListRow ─────────────────────────────────────────────────────────── */

const ROW_LOOK = {
    // In a ListCard: full width, the card's hairlines between rows.
    card: { box: 'px-5', hover: 'hover:bg-accent/60', current: 'bg-accent' },
    // In a pane's list (threads, contacts): rounded, lifted when current.
    pane: { box: 'rounded-xl px-3', hover: 'hover:bg-accent', current: 'bg-card shadow-sm ring-1 ring-border' },
} as const;

/**
 * One row of a list: a picture, a short line over the title, the title with a
 * time or count at its right, up to two lines under it, and something at the
 * end (an unread count, a state, an arrow). With `href` or `onSelect` the
 * whole row is one link or button. `actions` (a DropdownMenu, an icon) and
 * `action` (a text button) sit beside it, never inside it, so a row never
 * nests one control in another. The classic DataRow's place.
 */
export function ListRow({
    title,
    eyebrow,
    meta,
    description,
    detail,
    leading,
    trailing,
    actions,
    action,
    revealActions = 'always',
    href,
    onSelect,
    current = false,
    unread = false,
    lines = 1,
    variant = 'card',
    size = 'md',
    stackBelow,
    as: Tag = 'li',
    className,
}: {
    title: ReactNode;
    /** A short line over the title: its kind, a state, a date. */
    eyebrow?: ReactNode;
    /** At the title's right: a time, a count. */
    meta?: ReactNode;
    /** One line under the title, cut to fit. */
    description?: ReactNode;
    /** A second line under the title, quieter: where it came from, what it is bound to. */
    detail?: ReactNode;
    /** An Avatar, a Monogram, an icon. */
    leading?: ReactNode;
    /**
     * At the row's end, inside it: an unread count, a StateBadge, an arrow.
     * When beside the text it would leave the text less than 9rem (a phone,
     * a wide end), it drops under the text instead.
     */
    trailing?: ReactNode;
    /**
     * At the row's end, outside its link: a DropdownMenu, icon buttons. Like
     * `trailing`, it drops under the text when beside it the text would keep
     * less than 9rem.
     */
    actions?: ReactNode;
    /**
     * A button with words ("Remove", "Retry this guardian"), outside the row's
     * link: beside its text from sm, under it on a phone, lined up with it.
     */
    action?: ReactNode;
    /** `hover`: from md the actions show on hover, on focus and while open; a phone always shows them. */
    revealActions?: 'always' | 'hover';
    href?: string;
    onSelect?: () => void;
    /** The row that is open now: marked, and read as current. */
    current?: boolean;
    /** Something new in it: the title in bold, the line in full ink. */
    unread?: boolean;
    /**
     * `1`: the title and the line under it are cut to fit. `all`: both wrap
     * in full (a query, a note to read whole); the picture and the end stay
     * level with the title.
     */
    lines?: 1 | 'all';
    variant?: 'card' | 'pane';
    /**
     * `lg`: a step or a state to read, not a row to scan (ochk.app's home).
     * The title at 1.125rem, more air around each row, and the hairlines
     * inset to the text as a padded card's would be.
     */
    size?: 'md' | 'lg';
    /**
     * Below this width the end (`trailing`, `actions`, `action`) always sits
     * under the title, which keeps the whole row's width. For a title that is
     * one long token (a bc1q address, an npub, an id) that would otherwise
     * wrap three times beside a badge. A status badge goes in `trailing`, not
     * `leading`: `leading` is the row's picture and stays beside the title.
     * From this width up the row is as without it.
     */
    stackBelow?: 'sm' | 'md';
    as?: 'li' | 'div';
    className?: string;
}) {
    const tight = useDensity() === 'compact';
    const lg = size === 'lg';
    const look = ROW_LOOK[variant];
    const interactive = href !== undefined || onSelect !== undefined;
    const aria = current ? { 'aria-current': 'true' as const } : {};
    // Controls of its own (a menu, a text button) cannot sit inside the row's link: then the title is the link, its target stretched over the row.
    const split = Boolean(actions || action);
    const box = cn(
        'flex min-h-11 w-full min-w-0 gap-3 text-left outline-none transition-colors',
        lines === 'all' ? 'items-start' : 'items-center',
        !split && 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        lg ? 'py-5' : look.box,
        lg ? null : variant === 'pane' ? 'py-2' : tight ? 'py-3' : 'py-4',
        interactive && !current && look.hover,
        current && look.current
    );
    const stretch = cn(
        'outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring',
        variant === 'pane' && 'after:rounded-xl'
    );
    const open = (children: ReactNode, className?: string) =>
        href !== undefined ? (
            href.startsWith('/') ? (
                <Link href={href} className={className} {...aria}>
                    {children}
                </Link>
            ) : (
                <a href={href} className={className} {...aria}>
                    {children}
                </a>
            )
        ) : onSelect ? (
            <button type="button" onClick={onSelect} className={cn('text-left', className)} {...aria}>
                {children}
            </button>
        ) : (
            <div className={className}>{children}</div>
        );
    const body = (
        <>
            {leading ? <span className="flex shrink-0">{leading}</span> : null}
            {/*
             * The text, and what follows it: beside it while the text keeps
             * 9rem, under it and lined up with it when not, so a wide end
             * (a badge and two buttons) never squeezes a title to a word.
             */}
            <span
                className={cn(
                    'flex min-w-0 flex-1 flex-wrap',
                    lg ? 'gap-x-8 gap-y-4 sm:items-center' : 'gap-x-3 gap-y-2',
                    lines === 'all' ? 'items-start' : 'items-center'
                )}
            >
                <span
                    className={cn(
                        'flex min-w-0 flex-[1_1_9rem] flex-col',
                        lg ? 'gap-1' : 'gap-0.5',
                        stackBelow === 'sm' && 'max-sm:basis-full',
                        stackBelow === 'md' && 'max-md:basis-full'
                    )}
                >
                    {eyebrow ? (
                        <span className={cn(lg ? 'text-[0.875rem]' : 'text-[0.8125rem]', 'text-muted-foreground', lines === 'all' ? '[overflow-wrap:anywhere]' : 'truncate')}>
                            {eyebrow}
                        </span>
                    ) : null}
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                        <span
                            className={cn(
                                'text-foreground',
                                lg ? 'text-[1.125rem] leading-snug tracking-[-0.01em]' : 'text-[0.9375rem]',
                                lines === 'all' ? 'min-w-0 [overflow-wrap:anywhere]' : 'truncate',
                                unread ? 'font-semibold' : lg ? 'font-normal' : 'font-medium'
                            )}
                        >
                            {split && interactive ? open(title, stretch) : title}
                        </span>
                        {meta ? <span className="oca-tabular shrink-0 text-[0.8125rem] text-muted-foreground">{meta}</span> : null}
                    </span>
                    {description ? (
                        <span
                            className={cn(
                                lg ? 'max-w-[36rem] text-[0.9375rem] leading-relaxed' : 'text-[0.875rem]',
                                lines === 'all' ? 'whitespace-pre-line [overflow-wrap:anywhere]' : 'truncate',
                                unread ? 'text-foreground' : 'text-muted-foreground'
                            )}
                        >
                            {description}
                        </span>
                    ) : null}
                    {detail ? (
                        <span className={cn('text-[0.8125rem] text-muted-foreground', lines === 'all' ? 'whitespace-pre-line [overflow-wrap:anywhere]' : 'truncate')}>
                            {detail}
                        </span>
                    ) : null}
                </span>
                {/* Level with the title's first line when the row wraps, past the line over it. */}
                {trailing ? (
                    <span
                    className={cn(
                        'flex shrink-0 items-center gap-2',
                        lines === 'all' && 'min-h-[1.40625rem]',
                        lines === 'all' && eyebrow && 'mt-[1.34375rem]',
                        // Stacked under the title it needs no lift to meet the title's line.
                        stackBelow === 'sm' && 'max-sm:mt-0',
                        stackBelow === 'md' && 'max-md:mt-0'
                    )}
                >
                        {trailing}
                    </span>
                ) : null}
                {actions ? (
                    <span
                        className={cn(
                            'relative z-10 flex shrink-0 items-center',
                            revealActions === 'hover' &&
                                'transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100 md:has-[[data-state=open]]:opacity-100'
                        )}
                    >
                        {actions}
                    </span>
                ) : null}
                {/* A text action takes a line of its own on a phone. */}
                {action ? <span className="relative z-10 flex shrink-0 items-center gap-2 max-sm:basis-full">{action}</span> : null}
            </span>
        </>
    );
    return (
        <Tag
            data-size={lg ? 'lg' : undefined}
            className={cn(
                'group/row relative',
                // Inset hairlines: the row sits inside the card's padding, its first and last taking the card's own.
                lg && 'mx-6 first:pt-1 last:pb-1 md:mx-8 md:first:pt-3 md:last:pb-3',
                className
            )}
        >
            {split ? <div className={box}>{body}</div> : open(body, box)}
        </Tag>
    );
}

/* ── ChoiceGroup ─────────────────────────────────────────────────────── */

const ChoiceSize = createContext<'md' | 'sm'>('md');

const COLUMNS = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' } as const;

/**
 * One choice from a few, each a card: who you are, who can post, how often.
 * A radio group underneath, so a screen reader hears "2 of 3, checked" and
 * the arrow keys move between them. `sm` sets them as rows, for a dialog.
 */
export function ChoiceGroup<T extends string>({
    value,
    onValueChange,
    label,
    error,
    columns = 1,
    size = 'md',
    disabled,
    className,
    children,
}: {
    value: T | undefined;
    onValueChange: (value: T) => void;
    /** What is being chosen, for a screen reader. */
    label: string;
    /** Why the choice was refused: shown under the group, which it describes and marks invalid. */
    error?: ReactNode;
    columns?: 1 | 2 | 3;
    size?: 'md' | 'sm';
    disabled?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const errorId = `${useId()}-error`;
    return (
        <ChoiceSize.Provider value={size}>
            <RadioGroupPrimitive.Root
                value={value ?? ''}
                onValueChange={(v) => onValueChange(v as T)}
                aria-label={label}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                disabled={disabled}
                className={cn('grid', size === 'sm' ? 'gap-1.5' : 'gap-3', COLUMNS[columns], className)}
            >
                {children}
            </RadioGroupPrimitive.Root>
            {/* After the group, in the parent's flow, as a Field's error sits after its control. */}
            {error ? (
                <p id={errorId} role="alert" className="text-[0.8125rem] leading-snug text-destructive">
                    {error}
                </p>
            ) : null}
        </ChoiceSize.Provider>
    );
}

export function ChoiceCard({
    value,
    title,
    description,
    icon,
    disabled,
    className,
}: {
    value: string;
    title: ReactNode;
    description?: ReactNode;
    /** A lucide icon; it takes the accent when chosen. */
    icon?: ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    const sm = useContext(ChoiceSize) === 'sm';
    return (
        <RadioGroupPrimitive.Item
            value={value}
            disabled={disabled}
            className={cn(
                'group flex w-full min-w-0 items-start gap-3 border text-left outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'border-border bg-card data-[state=checked]:border-foreground data-[state=checked]:bg-accent data-[state=unchecked]:hover:border-oca-hairline-strong',
                'disabled:cursor-not-allowed disabled:opacity-50',
                sm ? 'min-h-11 rounded-xl px-3.5 py-2.5' : 'rounded-[1.25rem] p-5',
                className
            )}
        >
            {icon ? (
                <span
                    aria-hidden
                    className={cn(
                        'shrink-0 text-muted-foreground group-data-[state=checked]:text-oca-accent-ink [&_svg]:size-full',
                        sm ? 'mt-0.5 size-4' : 'size-6'
                    )}
                >
                    {icon}
                </span>
            ) : null}
            <span className="flex min-w-0 flex-col gap-1">
                <span className={sm ? 'text-[0.9375rem] font-medium' : 'oca-title-sm'}>{title}</span>
                {description ? <span className="text-[0.875rem] leading-relaxed text-muted-foreground">{description}</span> : null}
            </span>
        </RadioGroupPrimitive.Item>
    );
}
