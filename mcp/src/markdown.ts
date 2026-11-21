/** Just enough markdown for the docs' .md copies: headings, sections, blocks and anchors. */

export interface Heading {
    depth: number;
    text: string;
    slug: string;
    /** Index of the heading's line. */
    line: number;
}

export interface Block {
    kind: 'code' | 'text';
    /** The block's lines exactly as the page has them, fences included. */
    raw: string;
    /** For code, the fence's info string (ts, bash, ...). */
    lang?: string;
    /** For code, the lines between the fences. */
    code?: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** The text a heading shows: inline code, emphasis and link targets dropped. */
export function headingText(raw: string): string {
    return raw
        .replace(/\s+#+\s*$/, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .trim();
}

/** github-slugger's rule, which rehype-slug uses for the docs' anchors. */
export function slugBase(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
}

/** Each line's fence state: true for a line inside or on a code fence. */
function fencedLines(lines: string[]): boolean[] {
    const out: boolean[] = [];
    let open: string | null = null;
    for (const line of lines) {
        const m = FENCE.exec(line);
        if (open === null) {
            if (m) {
                open = m[1]!;
                out.push(true);
            } else out.push(false);
        } else {
            out.push(true);
            const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
            if (close && close[1]![0] === open[0] && close[1]!.length >= open.length) open = null;
        }
    }
    return out;
}

/** Every heading outside code, with the anchor the rendered page gives it. */
export function headings(markdown: string): Heading[] {
    const lines = markdown.split('\n');
    const fenced = fencedLines(lines);
    const seen = new Map<string, number>();
    const out: Heading[] = [];
    lines.forEach((line, i) => {
        if (fenced[i]) return;
        const m = /^(#{1,6})\s+(.+)$/.exec(line);
        if (!m) return;
        const text = headingText(m[2]!);
        const base = slugBase(text);
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        out.push({ depth: m[1]!.length, text, slug: n === 0 ? base : `${base}-${n}`, line: i });
    });
    return out;
}

export interface Section {
    heading: Heading;
    /** The section's markdown, its heading line included, up to the next heading of the same or a higher level. */
    markdown: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The heading a name points at: its anchor (with or without #), or its text, exactly and then as a prefix. */
export function findHeading(markdown: string, name: string): Heading | undefined {
    const all = headings(markdown);
    const want = name.replace(/^#/, '').trim();
    return (
        all.find((h) => h.slug === want) ??
        all.find((h) => h.slug === slugBase(want)) ??
        all.find((h) => norm(h.text) === norm(want)) ??
        all.find((h) => norm(h.text).startsWith(norm(want)))
    );
}

export function section(markdown: string, name: string): Section | undefined {
    const h = findHeading(markdown, name);
    if (!h) return undefined;
    const lines = markdown.split('\n');
    const all = headings(markdown);
    const next = all.find((o) => o.line > h.line && o.depth <= h.depth);
    const end = next ? next.line : lines.length;
    return { heading: h, markdown: lines.slice(h.line, end).join('\n').trimEnd() + '\n' };
}

/** A section's body as blocks: code fences whole, and runs of text split at blank lines. Headings are left out. */
export function blocks(markdown: string): Block[] {
    const lines = markdown.split('\n');
    const fenced = fencedLines(lines);
    const out: Block[] = [];
    let text: string[] = [];
    const flush = () => {
        if (text.length) out.push({ kind: 'text', raw: text.join('\n') });
        text = [];
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (fenced[i]) {
            flush();
            const open = FENCE.exec(line)!;
            const body: string[] = [];
            let j = i + 1;
            while (j < lines.length && fenced[j] && !/^ {0,3}(`{3,}|~{3,})\s*$/.test(lines[j]!)) {
                body.push(lines[j]!);
                j++;
            }
            const close = j < lines.length && fenced[j] ? j : j - 1;
            out.push({
                kind: 'code',
                raw: lines.slice(i, close + 1).join('\n'),
                lang: open[2]!.trim() || undefined,
                code: body.join('\n'),
            });
            i = close;
            continue;
        }
        if (line.trim() === '' || /^#{1,6}\s/.test(line)) flush();
        else text.push(line);
    }
    flush();
    return out;
}
