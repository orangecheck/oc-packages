import * as TabsPrimitive from '@radix-ui/react-tabs';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';

import { grammarOf, highlight, linesToHtml, parseLineRanges, readDiff } from '../code/highlight';
import { cn } from '../lib/cn';
import { ScrollFade } from '../primitives/scroll-fade';
import { CopyButton } from './data';

const LANG_NAME: Record<string, string> = {
    ts: 'TypeScript',
    typescript: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    javascript: 'JavaScript',
    jsx: 'JSX',
    mjs: 'JavaScript',
    json: 'JSON',
    jsonc: 'JSON',
    bash: 'Shell',
    sh: 'Shell',
    shell: 'Shell',
    zsh: 'Shell',
    console: 'Terminal',
    terminal: 'Terminal',
    python: 'Python',
    py: 'Python',
    yaml: 'YAML',
    yml: 'YAML',
    diff: 'Diff',
    text: 'Text',
};

/** "TypeScript" for ts, "Shell" for bash; the fence name itself for anything else. */
export function languageName(lang?: string): string | undefined {
    return lang ? (LANG_NAME[lang.toLowerCase()] ?? lang) : undefined;
}

/*
 * What a copy button puts on the clipboard: the code as written, without
 * removed lines and, for a shell transcript with `$ ` prompts, only the
 * commands, without their prompts.
 */
function forClipboard(text: string, lang?: string): string {
    if (grammarOf(lang) !== 'shell') return text;
    const lines = text.split('\n');
    if (!lines.some((l) => l.startsWith('$ '))) return text;
    return lines
        .filter((l) => l.startsWith('$ '))
        .map((l) => l.slice(2))
        .join('\n');
}

function linesFromDom(pre: HTMLElement | null): string | null {
    if (!pre) return null;
    const lines = pre.querySelectorAll('[data-line]');
    if (lines.length === 0) return pre.textContent ?? '';
    return Array.from(lines)
        .filter((l) => l.getAttribute('data-diff') !== 'remove')
        .map((l) => l.textContent ?? '')
        .join('\n');
}

interface Prepared {
    html: string;
    /** The code as a reader would copy it. */
    copy: string;
    lines: number;
    diff: boolean;
}

function prepare(code: string, lang: string | undefined, marks: string | readonly number[] | undefined, diff: boolean): Prepared {
    const d = diff ? readDiff(code) : null;
    const src = d ? d.code : code.replace(/\r?\n$/, '');
    const lines = highlight(src, lang === 'diff' ? undefined : lang);
    const kept = d ? src.split('\n').filter((_, i) => d.diff.get(i + 1) !== 'remove') : null;
    return {
        html: linesToHtml(lines, { highlight: parseLineRanges(marks), diff: d?.diff }),
        copy: kept ? kept.join('\n') : src,
        lines: lines.length,
        diff: !!d,
    };
}

/** The dark well: lines that scroll sideways, folding past `maxLines`. */
function Well({
    preRef,
    html,
    children,
    lang,
    lines,
    maxLines,
    diff,
    lineNumbers,
}: {
    preRef?: RefObject<HTMLPreElement | null>;
    html?: string;
    children?: ReactNode;
    lang?: string;
    lines: number;
    maxLines?: number;
    diff?: boolean;
    lineNumbers?: boolean;
}) {
    const foldable = maxLines !== undefined && lines > maxLines + 2;
    const [open, setOpen] = useState(false);
    const folded = foldable && !open;
    // Markup made of lines carries its own side padding, so a marked line runs edge to edge.
    const lined = html !== undefined;
    return (
        <div className="relative">
            <div
                className={cn(folded && 'overflow-hidden')}
                style={folded ? { maxHeight: `calc(${maxLines} * 1.625em + 2rem)` } : undefined}
            >
                <ScrollFade fade="var(--oca-code-surface)">
                    <pre
                        ref={preRef}
                        data-diff={diff ? '' : undefined}
                        data-line-numbers={lineNumbers ? '' : undefined}
                        className={cn(
                            'oca-code w-max min-w-full py-4 font-mono text-[0.875rem] leading-[1.625] text-oca-ink-muted [font-variant-ligatures:none]',
                            !lined && 'px-5'
                        )}
                    >
                        {lined ? (
                            <code className="block" data-lang={lang} dangerouslySetInnerHTML={{ __html: html }} />
                        ) : (
                            <code className="block" data-lang={lang}>
                                {children}
                            </code>
                        )}
                    </pre>
                </ScrollFade>
            </div>
            {foldable ? (
                <div
                    className={cn('flex justify-center px-5 pb-4', folded && 'absolute inset-x-0 bottom-0 pt-16')}
                    style={folded ? { background: 'linear-gradient(to top, var(--oca-code-surface) 40%, transparent)' } : undefined}
                >
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="rounded-full border border-white/20 px-4 py-1.5 text-[0.8125rem] text-white transition-colors hover:bg-white/10"
                    >
                        {open ? 'Show less' : `Show all ${lines} lines`}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

const FRAME = 'overflow-hidden rounded-[1.25rem] border border-[var(--oca-code-line)] bg-[var(--oca-code-surface)]';
const COPY_ON_INK = 'text-oca-ink-subtle hover:bg-white/10 hover:text-white';

export interface CodeBlockProps {
    /** The source. Highlighted here, on the server too, when `lang` is one the package reads. */
    code?: string;
    /**
     * Highlighted markup made at build time (rehypeCode, highlightToHtml).
     * Trusted markup only: it is set as HTML.
     */
    html?: string;
    /** Highlighted nodes from another highlighter. */
    children?: ReactNode;
    /** The fence name: ts, tsx, json, bash, python, yaml, diff. */
    lang?: string;
    /** The file name or purpose. Defaults to the language's name, or "Code". */
    caption?: ReactNode;
    copy?: boolean;
    /** Fold past this many lines, with a button for the rest. */
    maxLines?: number;
    /** Lines to mark, 1-based: "2,4-6" or [2, 4, 5, 6]. With `code`. */
    highlight?: string | readonly number[];
    /** Read `+` and `-` at the start of each line as added and removed. With `code`; `lang="diff"` implies it. */
    diff?: boolean;
    /** Number the lines. */
    lineNumbers?: boolean;
    /** Beside the copy button: a download, a raw/pretty switch. */
    actions?: ReactNode;
    className?: string;
}

/**
 * A block of code: a header with its name and a copy button, then the code
 * on a dark well, highlighted, that scrolls sideways (with an edge that says
 * so) rather than cutting a line off. Lines can be marked, shown as a diff,
 * or numbered; the marks are drawn, so copying takes the code as written.
 * Past `maxLines` it folds.
 */
export function CodeBlock({
    code,
    html,
    children,
    lang,
    caption,
    copy = true,
    maxLines,
    highlight: marks,
    diff,
    lineNumbers,
    actions,
    className,
}: CodeBlockProps) {
    const preRef = useRef<HTMLPreElement>(null);
    const isDiff = diff || lang === 'diff';
    const markKey = typeof marks === 'string' ? marks : marks?.join(',');
    const prepared = useMemo(
        () => (html === undefined && children === undefined && code !== undefined ? prepare(code, lang, markKey, !!isDiff) : null),
        [code, html, children, lang, markKey, isDiff]
    );
    const markup = prepared?.html ?? html;
    const lines = prepared?.lines ?? (html !== undefined ? html.split('\n').length : (code?.split('\n').length ?? 0));
    const read = () => forClipboard(prepared?.copy ?? linesFromDom(preRef.current) ?? code ?? '', lang);
    return (
        <figure className={cn(FRAME, className)}>
            <figcaption className="flex h-11 items-center justify-between gap-3 border-b border-[var(--oca-code-line)] pl-5 pr-2">
                <span className="truncate text-[0.8125rem] text-oca-ink-subtle">{caption ?? languageName(lang) ?? 'Code'}</span>
                <span className="flex shrink-0 items-center gap-1">
                    {actions}
                    {copy ? <CopyButton value={read} label="Copy code" className={COPY_ON_INK} /> : null}
                </span>
            </figcaption>
            <Well
                preRef={preRef}
                html={markup}
                lang={lang}
                lines={lines}
                maxLines={maxLines}
                diff={prepared ? prepared.diff : isDiff}
                lineNumbers={lineNumbers}
            >
                {children}
            </Well>
        </figure>
    );
}

/* ── Tabs of code ────────────────────────────────────────────────────── */

const tabListeners = new Map<string, Set<() => void>>();
const tabMemory = new Map<string, string>();
const storeKey = (k: string) => `oca-code-tab:${k}`;

function readTab(key: string): string | null {
    if (tabMemory.has(key)) return tabMemory.get(key)!;
    try {
        return window.localStorage.getItem(storeKey(key));
    } catch {
        return null;
    }
}

function writeTab(key: string, value: string) {
    tabMemory.set(key, value);
    try {
        window.localStorage.setItem(storeKey(key), value);
    } catch {
        /* private mode: the choice lasts for this page */
    }
    tabListeners.get(key)?.forEach((l) => l());
}

/** One choice shared by every CodeTabs with the same key, remembered in this browser. */
function useSyncedTab(key: string | undefined): [string | null, (v: string) => void] {
    const subscribe = useCallback(
        (cb: () => void) => {
            if (!key) return () => {};
            const set = tabListeners.get(key) ?? new Set();
            set.add(cb);
            tabListeners.set(key, set);
            return () => {
                set.delete(cb);
            };
        },
        [key]
    );
    const value = useSyncExternalStore(
        subscribe,
        () => (key ? readTab(key) : null),
        () => null
    );
    return [value, (v: string) => key && writeTab(key, v)];
}

export interface CodeTab {
    /** The tab's name, and what `syncKey` remembers: "npm", "curl", "Python". */
    label: string;
    code: string;
    lang?: string;
}

/**
 * The same thing in several forms (npm, yarn, pnpm; curl, Node, Python) in
 * one well, with tabs in its header and a copy button for the one shown.
 * Give every set the same `syncKey` and choosing "pnpm" once switches them
 * all, on this page and the next.
 */
export function CodeTabs({
    items,
    syncKey,
    defaultValue,
    maxLines,
    className,
}: {
    items: CodeTab[];
    syncKey?: string;
    /** The label shown first. Default: the first item. */
    defaultValue?: string;
    maxLines?: number;
    className?: string;
}) {
    const [synced, setSynced] = useSyncedTab(syncKey);
    const [local, setLocal] = useState<string | null>(null);
    const labels = items.map((it) => it.label);
    const pick = [local, synced, defaultValue].find((v): v is string => !!v && labels.includes(v)) ?? labels[0] ?? '';
    const active = items.find((it) => it.label === pick);
    const prepared = useMemo(() => items.map((it) => prepare(it.code, it.lang, undefined, it.lang === 'diff')), [items]);
    return (
        <TabsPrimitive.Root
            value={pick}
            onValueChange={(v) => {
                setLocal(v);
                setSynced(v);
            }}
            className={cn(FRAME, className)}
        >
            <div className="flex h-11 items-center justify-between gap-3 border-b border-[var(--oca-code-line)] pl-2 pr-2">
                <ScrollFade fade="var(--oca-code-surface)" className="min-w-0 flex-1">
                    <TabsPrimitive.List aria-label="Versions" className="flex w-max items-center gap-0.5">
                        {items.map((it) => (
                            <TabsPrimitive.Trigger
                                key={it.label}
                                value={it.label}
                                className={cn(
                                    'relative inline-flex h-11 items-center whitespace-nowrap px-3 text-[0.8125rem] text-oca-ink-subtle outline-none transition-colors',
                                    'hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                                    'data-[state=active]:text-white',
                                    'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-oca-orange'
                                )}
                            >
                                {it.label}
                            </TabsPrimitive.Trigger>
                        ))}
                    </TabsPrimitive.List>
                </ScrollFade>
                {active ? (
                    <CopyButton
                        value={() => forClipboard(prepared[items.indexOf(active)]?.copy ?? active.code, active.lang)}
                        label={`Copy ${active.label}`}
                        className={COPY_ON_INK}
                    />
                ) : null}
            </div>
            {items.map((it, i) => (
                <TabsPrimitive.Content key={it.label} value={it.label} className="outline-none" tabIndex={-1}>
                    <Well
                        html={prepared[i]!.html}
                        lang={it.lang}
                        lines={prepared[i]!.lines}
                        maxLines={maxLines}
                        diff={prepared[i]!.diff}
                    />
                </TabsPrimitive.Content>
            ))}
        </TabsPrimitive.Root>
    );
}

/** `npm install`, `yarn add` and `pnpm add` for a package, in one remembered set of tabs. */
export function InstallTabs({ pkg, dev = false, className }: { pkg: string; dev?: boolean; className?: string }) {
    const items: CodeTab[] = [
        { label: 'npm', code: `npm install ${dev ? '--save-dev ' : ''}${pkg}`, lang: 'bash' },
        { label: 'yarn', code: `yarn add ${dev ? '--dev ' : ''}${pkg}`, lang: 'bash' },
        { label: 'pnpm', code: `pnpm add ${dev ? '--save-dev ' : ''}${pkg}`, lang: 'bash' },
    ];
    return <CodeTabs items={items} syncKey="package-manager" className={className} />;
}
