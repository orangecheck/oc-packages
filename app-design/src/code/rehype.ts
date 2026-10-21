import { highlight, linesToHtml, parseCodeMeta, parseLineRanges, readDiff, type CodeLine } from './highlight';

/*
 * A rehype plugin for MDX (@next/mdx, @mdx-js/mdx): highlights every fenced
 * code block at build time and reads its meta, so a page ships coloured code
 * with no highlighter in the browser.
 *
 *   ```ts title="gate.ts" {2,4}      a caption and two marked lines
 *   ```diff                          + and - lines (or `diff` in the meta)
 *   ```bash showLineNumbers          numbered lines
 *   ```mermaid size=834x623          a diagram's drawn size, so its page holds still
 *
 * Each block becomes <pre data-oca-code data-html="…" data-lang data-title
 * data-diff data-line-numbers data-eol>, which mdxComponents' `pre` hands to
 * CodeBlock. The highlighted markup travels as one string per block rather
 * than as an element per token, so a page's JavaScript grows by the size of
 * its code, not by a call for every word in it. No dependencies: it walks
 * the tree itself.
 */

interface HastNode {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
    data?: { meta?: string | null };
}

export interface RehypeCodeOptions {
    /**
     * Replace the built-in highlighter, for instance with shiki's tokens
     * mapped onto these kinds. Return null to fall back to the built-in one.
     */
    tokenize?: (code: string, lang: string | undefined) => CodeLine[] | null;
    /** Fences to leave as they are. Default: mermaid (drawn by Diagram). */
    skip?: readonly string[];
}

function textOf(node: HastNode): string {
    if (node.type === 'text') return node.value ?? '';
    return (node.children ?? []).map(textOf).join('');
}

function langOf(code: HastNode): string | undefined {
    const cls = code.properties?.className;
    const list = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(' ') : [];
    for (const c of list) {
        const m = String(c).match(/^language-(.+)$/);
        if (m) return m[1];
    }
    return undefined;
}

export function rehypeCode(options: RehypeCodeOptions = {}) {
    const skip = new Set(options.skip ?? ['mermaid']);
    const visit = (node: HastNode) => {
        for (const child of node.children ?? []) {
            const code = child.type === 'element' && child.tagName === 'pre' ? child.children?.[0] : undefined;
            if (code && code.type === 'element' && code.tagName === 'code' && child.children?.length === 1) {
                const lang = langOf(code);
                const meta = parseCodeMeta(code.data?.meta);
                if (lang && skip.has(lang)) {
                    // A diagram's size rides on the pre, for the page to hold its height.
                    if (meta.size) child.properties = { ...child.properties, dataSize: meta.size };
                    continue;
                }
                let source = textOf(code);
                const newline = /\n$/.test(source);
                const diff = meta.diff || lang === 'diff' ? readDiff(source) : null;
                if (diff) source = diff.code;
                const lines = options.tokenize?.(source, lang) ?? highlight(source, lang === 'diff' ? undefined : lang);
                child.properties = {
                    ...child.properties,
                    dataOcaCode: '',
                    dataHtml: linesToHtml(lines, { highlight: parseLineRanges(meta.highlight), diff: diff?.diff }),
                    ...(lang ? { dataLang: lang } : {}),
                    ...(meta.title ? { dataTitle: meta.title } : {}),
                    ...(diff ? { dataDiff: '' } : {}),
                    ...(meta.lineNumbers ? { dataLineNumbers: '' } : {}),
                    ...(newline ? { dataEol: '' } : {}),
                };
                child.children = [];
                continue;
            }
            visit(child);
        }
    };
    return (tree: HastNode) => visit(tree);
}
