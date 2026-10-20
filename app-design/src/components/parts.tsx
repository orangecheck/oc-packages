import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import Link from 'next/link';
import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';

/* Parts a signed-in page repeats: a block's title, a list in a card, its rows, a choice between cards. */

/* ── SectionTitle ────────────────────────────────────────────────────── */

/**
 * A block's title on a signed-in page or a tool: the name, a count or state
 * after it, one line under it, and an action at the right that wraps under
 * the text on a phone. Public pages use SectionHeading, at display size.
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
        <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
            <div className="flex min-w-0 max-w-[40rem] flex-[1_1_16rem] flex-col gap-1">
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
    return <Tag className={cn('divide-y divide-border overflow-clip rounded-[1.25rem] border border-border bg-card', className)} {...props} />;
}

/* ── ListRow ─────────────────────────────────────────────────────────── */

const ROW_LOOK = {
    // In a ListCard: full width, the card's hairlines between rows.
    card: { box: 'px-5', hover: 'hover:bg-accent/60', current: 'bg-accent' },
    // In a pane's list (threads, contacts): rounded, lifted when current.
    pane: { box: 'rounded-xl px-3', hover: 'hover:bg-accent', current: 'bg-card shadow-sm ring-1 ring-border' },
} as const;

/**
 * One row of a list: a picture, a title with a time or count at its right, a
 * line under it, and something at the end (an unread count, a state, an
 * arrow). With `href` or `onSelect` the whole row is one link or button.
 * `actions` (a DropdownMenu, a button) sits beside it, never inside it, so a
 * row never nests one control in another. The classic DataRow's place.
 */
export function ListRow({
    title,
    meta,
    description,
    leading,
    trailing,
    actions,
    revealActions = 'always',
    href,
    onSelect,
    current = false,
    unread = false,
    variant = 'card',
    as: Tag = 'li',
    className,
}: {
    title: ReactNode;
    /** At the title's right: a time, a count. */
    meta?: ReactNode;
    /** One line under the title, cut to fit. */
    description?: ReactNode;
    /** An Avatar, a Monogram, an icon. */
    leading?: ReactNode;
    /** At the row's end, inside it: an unread count, a StateBadge, an arrow. */
    trailing?: ReactNode;
    /** Beside the row, outside it: a DropdownMenu of what can be done to it. */
    actions?: ReactNode;
    /** `hover`: from md the actions show on hover, on focus and while open; a phone always shows them. */
    revealActions?: 'always' | 'hover';
    href?: string;
    onSelect?: () => void;
    /** The row that is open now: marked, and read as current. */
    current?: boolean;
    /** Something new in it: the title in bold, the line in full ink. */
    unread?: boolean;
    variant?: 'card' | 'pane';
    as?: 'li' | 'div';
    className?: string;
}) {
    const tight = useDensity() === 'compact';
    const look = ROW_LOOK[variant];
    const interactive = href !== undefined || onSelect !== undefined;
    const cls = cn(
        'flex min-h-11 w-full min-w-0 items-center gap-3 text-left outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        look.box,
        variant === 'pane' ? 'py-2' : tight ? 'py-3' : 'py-4',
        interactive && !current && look.hover,
        current && look.current,
        actions && 'pr-14'
    );
    const body = (
        <>
            {leading ? <span className="flex shrink-0">{leading}</span> : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                    <span className={cn('truncate text-[0.9375rem] text-foreground', unread ? 'font-semibold' : 'font-medium')}>{title}</span>
                    {meta ? <span className="oca-tabular shrink-0 text-[0.8125rem] text-muted-foreground">{meta}</span> : null}
                </span>
                {description ? (
                    <span className={cn('truncate text-[0.875rem]', unread ? 'text-foreground' : 'text-muted-foreground')}>{description}</span>
                ) : null}
            </span>
            {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
        </>
    );
    const aria = current ? { 'aria-current': 'true' as const } : {};
    return (
        <Tag className={cn('group/row relative', className)}>
            {href !== undefined ? (
                href.startsWith('/') ? (
                    <Link href={href} className={cls} {...aria}>
                        {body}
                    </Link>
                ) : (
                    <a href={href} className={cls} {...aria}>
                        {body}
                    </a>
                )
            ) : onSelect ? (
                <button type="button" onClick={onSelect} className={cls} {...aria}>
                    {body}
                </button>
            ) : (
                <div className={cls}>{body}</div>
            )}
            {actions ? (
                <div
                    className={cn(
                        'absolute right-2 top-1/2 flex -translate-y-1/2 items-center',
                        revealActions === 'hover' &&
                            'transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100 md:has-[[data-state=open]]:opacity-100'
                    )}
                >
                    {actions}
                </div>
            ) : null}
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
    columns?: 1 | 2 | 3;
    size?: 'md' | 'sm';
    disabled?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <ChoiceSize.Provider value={size}>
            <RadioGroupPrimitive.Root
                value={value ?? ''}
                onValueChange={(v) => onValueChange(v as T)}
                aria-label={label}
                disabled={disabled}
                className={cn('grid', size === 'sm' ? 'gap-1.5' : 'gap-3', COLUMNS[columns], className)}
            >
                {children}
            </RadioGroupPrimitive.Root>
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
