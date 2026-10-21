import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Kbd, Spinner } from '../primitives/feedback';

/*
 * Search, as a dialog: a field, results in groups, and the keyboard
 * throughout (⌘K or / to open, arrows to move, Enter to open, Esc to
 * close). It knows nothing about the index: `onQuery` returns the results,
 * from Pagefind, an API or a list in memory.
 */

export interface SearchResult {
    id: string;
    /** Where it goes. A result with `run` instead is an action. */
    href?: string;
    /** An action (a command palette's "Lock the vault"): runs instead of following a link. */
    run?: () => void;
    /** Before the title: what kind of thing it is. */
    icon?: ReactNode;
    /** At the end of the row: a word ("Action", "Login"), a shortcut. */
    meta?: ReactNode;
    title: ReactNode;
    /** Where it sits: "OC Stamp › Verify". */
    section?: ReactNode;
    excerpt?: ReactNode;
    /** An excerpt with <mark> around the matched words, from your own index. Trusted markup only. */
    excerptHtml?: string;
}

export interface SearchGroup {
    label: ReactNode;
    results: SearchResult[];
}

export type SearchQuery = (query: string, signal: AbortSignal) => Promise<SearchGroup[]> | SearchGroup[];

function useMacKeys(): boolean {
    const [mac, setMac] = useState(true);
    useEffect(() => {
        setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    }, []);
    return mac;
}

const typing = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** The header's way into search: a field-shaped button with its shortcut; an icon on a phone. */
export const SearchButton = forwardRef<HTMLButtonElement, { label?: string; onClick?: () => void; className?: string }>(function SearchButton(
    { label = 'Search', onClick, className },
    ref
) {
    const mac = useMacKeys();
    return (
        <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
            className={cn(
                'inline-flex size-10 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                'md:h-10 md:w-56 md:justify-start md:border md:border-border md:bg-card md:pl-3.5 md:pr-2 md:hover:border-oca-hairline-strong md:hover:bg-card',
                className
            )}
        >
            <Search aria-hidden className="size-[1.125rem] shrink-0 md:size-4" />
            {/* The word is the button's name at every width; a phone shows only the icon. */}
            <span className="sr-only flex-1 text-left text-[0.9375rem] md:not-sr-only">{label}</span>
            <Kbd aria-hidden className="hidden md:inline-flex">
                {mac ? '⌘K' : 'Ctrl K'}
            </Kbd>
        </button>
    );
});

export interface SearchDialogProps {
    onQuery: SearchQuery;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSelect?: (result: SearchResult) => void;
    /** Render the SearchButton that opens it. */
    button?: boolean;
    /** ⌘K / Ctrl+K and / open it. */
    hotkey?: boolean;
    label?: string;
    placeholder?: string;
    /** Shown before anything is typed: popular pages, a hint. */
    idle?: ReactNode;
    /** The query it opens with: a `?q=` from the address. */
    defaultQuery?: string;
    debounceMs?: number;
    className?: string;
    /** List before anything is typed: `onQuery('')` gives what to show first (recent items, actions). */
    browse?: boolean;
}

/**
 * Search the site. Uncontrolled it brings its own button (`button`), and
 * ⌘K or / opens it from anywhere on the page; pass `open` and
 * `onOpenChange` to drive it yourself. Choosing a result calls `onSelect`
 * (a router's push) or follows its link.
 */
export function SearchDialog({
    onQuery,
    open: openProp,
    onOpenChange,
    onSelect,
    button = true,
    hotkey = true,
    label = 'Search',
    placeholder = 'Search the docs',
    idle,
    defaultQuery = '',
    debounceMs = 120,
    browse = false,
    className,
}: SearchDialogProps) {
    const [own, setOwn] = useState(false);
    const open = openProp ?? own;
    const setOpen = (v: boolean) => {
        if (openProp === undefined) setOwn(v);
        onOpenChange?.(v);
    };
    const [query, setQuery] = useState(defaultQuery);
    const [groups, setGroups] = useState<SearchGroup[]>([]);
    const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [active, setActive] = useState(0);
    const listId = useId();
    const listRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    // Where focus was when it opened, to go back to on close.
    const returnTo = useRef<HTMLElement | null>(null);
    const flat = useMemo(() => groups.flatMap((g) => g.results), [groups]);
    // The latest props, for listeners and timers set up once.
    const latest = useRef({ open, setOpen, onQuery });
    latest.current = { open, setOpen, onQuery };

    useEffect(() => {
        if (!hotkey) return;
        const onKey = (e: KeyboardEvent) => {
            const { open: isOpen, setOpen: set } = latest.current;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                set(!isOpen);
            } else if (e.key === '/' && !isOpen && !typing(e.target)) {
                e.preventDefault();
                set(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hotkey]);

    useEffect(() => {
        const q = query.trim();
        if (!q && !(browse && open)) {
            setGroups([]);
            setState('idle');
            return;
        }
        const ctl = new AbortController();
        setState('loading');
        const t = setTimeout(async () => {
            try {
                const out = await latest.current.onQuery(q, ctl.signal);
                if (ctl.signal.aborted) return;
                setGroups(out.filter((g) => g.results.length > 0));
                setActive(0);
                setState('done');
            } catch {
                if (!ctl.signal.aborted) setState('error');
            }
        }, debounceMs);
        return () => {
            clearTimeout(t);
            ctl.abort();
        };
    }, [query, debounceMs, browse, open]);

    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const choose = (r: SearchResult) => {
        setOpen(false);
        if (r.run) r.run();
        else if (onSelect) onSelect(r);
        else if (r.href) window.location.assign(r.href);
    };
    const optionId = (i: number) => `${listId}-o${i}`;
    const showList = state === 'done' && flat.length > 0;
    let index = -1;

    return (
        <>
            {button ? <SearchButton ref={buttonRef} label={label} onClick={() => setOpen(true)} className={className} /> : null}
            <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="oca-animate-fade fixed inset-0 z-50 bg-[rgb(10_10_10/0.38)] backdrop-blur-[2px]" />
                    <DialogPrimitive.Content
                        aria-describedby={undefined}
                        onOpenAutoFocus={() => {
                            const el = document.activeElement;
                            returnTo.current = el instanceof HTMLElement && el !== document.body ? el : null;
                        }}
                        // With no Dialog.Trigger, Radix would leave focus on the page's body.
                        onCloseAutoFocus={(e) => {
                            const back = returnTo.current?.isConnected ? returnTo.current : buttonRef.current;
                            if (back) {
                                e.preventDefault();
                                back.focus();
                            }
                        }}
                        className="oca-animate-rise fixed left-1/2 top-3 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col overflow-hidden rounded-[1.5rem] border border-border bg-popover text-popover-foreground shadow-xl outline-none sm:top-[12vh] sm:max-h-[min(36rem,76vh)] sm:w-[min(92vw,40rem)]"
                    >
                        <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
                        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border pl-5 pr-3">
                            {state === 'loading' ? (
                                <Spinner className="size-[1.125rem] text-muted-foreground" />
                            ) : (
                                <Search aria-hidden className="size-[1.125rem] shrink-0 text-muted-foreground" />
                            )}
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (!showList) return;
                                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        const d = e.key === 'ArrowDown' ? 1 : -1;
                                        setActive((a) => (a + d + flat.length) % flat.length);
                                    } else if (e.key === 'Enter' && flat[active]) {
                                        e.preventDefault();
                                        choose(flat[active]!);
                                    }
                                }}
                                placeholder={placeholder}
                                role="combobox"
                                aria-label={label}
                                aria-expanded={showList}
                                aria-controls={listId}
                                aria-autocomplete="list"
                                aria-activedescendant={showList ? optionId(active) : undefined}
                                spellCheck={false}
                                autoComplete="off"
                                className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-oca-subtle"
                            />
                            <DialogPrimitive.Close className="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-2 text-[0.75rem] text-muted-foreground transition-colors hover:text-foreground">
                                {/* A phone has no Esc key. */}
                                <span className="sm:hidden">Close</span>
                                <span className="max-sm:hidden" aria-hidden>
                                    Esc
                                </span>
                                <span className="sr-only max-sm:hidden">Close search</span>
                            </DialogPrimitive.Close>
                        </div>
                        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                            <div id={listId} role="listbox" aria-label="Results" className={cn(!showList && 'hidden')}>
                                {groups.map((g, gi) => (
                                    <div key={gi} role="group" aria-label={typeof g.label === 'string' ? g.label : undefined} className="pb-1">
                                        <p aria-hidden className="px-3 pb-1.5 pt-3 text-[0.8125rem] text-muted-foreground">
                                            {g.label}
                                        </p>
                                        {g.results.map((r) => {
                                            index++;
                                            const i = index;
                                            const on = i === active;
                                            // A place is a link (it opens in a new tab with a modifier); an action is not.
                                            const Option = r.href ? 'a' : 'div';
                                            return (
                                                <Option
                                                    key={r.id}
                                                    id={optionId(i)}
                                                    {...(r.href ? { href: r.href } : {})}
                                                    role="option"
                                                    aria-selected={on}
                                                    tabIndex={-1}
                                                    onMouseMove={() => setActive(i)}
                                                    onClick={(e) => {
                                                        if (r.href && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
                                                        e.preventDefault();
                                                        choose(r);
                                                    }}
                                                    className={cn(
                                                        'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
                                                        on ? 'bg-accent shadow-[inset_0_0_0_2px_var(--ring)]' : 'hover:bg-accent',
                                                        !r.href && 'cursor-pointer'
                                                    )}
                                                >
                                                    {r.icon ? (
                                                        <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-[1.0625rem]">
                                                            {r.icon}
                                                        </span>
                                                    ) : null}
                                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                        <span className="truncate text-[0.9375rem] font-medium text-foreground">{r.title}</span>
                                                        {r.section ? <span className="truncate text-[0.8125rem] text-muted-foreground">{r.section}</span> : null}
                                                        {r.excerptHtml ? (
                                                            <span
                                                                className="line-clamp-2 text-[0.875rem] leading-snug text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-[color-mix(in_oklab,var(--oca-orange)_22%,transparent)] [&_mark]:px-0.5 [&_mark]:text-foreground"
                                                                dangerouslySetInnerHTML={{ __html: r.excerptHtml }}
                                                            />
                                                        ) : r.excerpt ? (
                                                            <span className="line-clamp-2 text-[0.875rem] leading-snug text-muted-foreground">{r.excerpt}</span>
                                                        ) : null}
                                                    </span>
                                                    {r.meta ? <span className="mt-0.5 shrink-0 text-[0.8125rem] text-muted-foreground">{r.meta}</span> : null}
                                                    <CornerDownLeft aria-hidden className={cn('mt-1 size-4 shrink-0 text-muted-foreground', !on && 'invisible')} />
                                                </Option>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                            {state === 'idle' ? (
                                <div className="px-3 py-6 text-[0.9375rem] text-muted-foreground">
                                    {idle ?? 'Type a word: a protocol, a function, an error.'}
                                </div>
                            ) : null}
                            {state === 'done' && flat.length === 0 ? (
                                <p role="status" className="px-3 py-6 text-[0.9375rem] text-muted-foreground">
                                    {query.trim() ? <>No results for &ldquo;{query.trim()}&rdquo;.</> : 'Nothing here yet.'}
                                </p>
                            ) : null}
                            {state === 'error' ? (
                                <p role="status" className="px-3 py-6 text-[0.9375rem] text-muted-foreground">
                                    Search is not available right now. Try again in a moment.
                                </p>
                            ) : null}
                        </div>
                        <div aria-hidden className="hidden shrink-0 items-center gap-4 border-t border-border px-5 py-2.5 text-[0.75rem] text-muted-foreground sm:flex">
                            <span className="flex items-center gap-1.5">
                                <Kbd>↑</Kbd>
                                <Kbd>↓</Kbd> to move
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>↵</Kbd> to open
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Kbd>esc</Kbd> to close
                            </span>
                        </div>
                        <span aria-live="polite" className="sr-only">
                            {state === 'done' ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}
                        </span>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        </>
    );
}

/**
 * A command palette (⌘K): SearchDialog with its list open before anything is
 * typed, `onQuery('')` giving the recent items and common actions. A result
 * with `run` is an action; one with `href` is a place to go. No button of its
 * own: ⌘K opens it, or drive `open` from yours.
 */
export function CommandDialog({
    label = 'Commands',
    placeholder = 'Search, or run a command',
    ...props
}: Omit<SearchDialogProps, 'browse' | 'button'>) {
    return <SearchDialog {...props} label={label} placeholder={placeholder} button={false} browse />;
}
