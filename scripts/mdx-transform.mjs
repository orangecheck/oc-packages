/**
 * The post-process gen-docs.mjs applies to TypeDoc output, shared with
 * drift-check.mjs so the two cannot diverge.
 */

// Deprecated packages, by directory. Their reference index opens with this notice;
// keep it in step with `npm deprecate`.
const DEPRECATED = {
    ui:
        '`@orangecheck/ui` is deprecated on npm and receives no updates.\n' +
        'Use [`@orangecheck/design`](https://design.ochk.io) instead; it ships every\n' +
        'component below.',
    'webhook-verify':
        '`@orangecheck/webhook-verify` verified webhook deliveries from\n' +
        'fleet.ochk.io, which is retired. It is deprecated on npm, receives no updates,\n' +
        'and has no replacement.',
};

/** `relPath` is the file's path under sdk/, e.g. `ui/README.mdx`. */
export function mdxTransform(raw, relPath = '') {
    // Match the YAML frontmatter that typedoc-plugin-frontmatter emits.
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n+/);
    if (!frontmatterMatch) return raw;
    const body = raw.slice(frontmatterMatch[0].length);

    // Pull title from first `# Heading` in the body.
    const titleMatch = body.match(/^#\s+(.+?)\s*$/m);
    const rawTitle = titleMatch ? titleMatch[1] : 'API reference';
    const title = stripMd(rawTitle);
    const description = `Auto-generated API reference for ${title}. Source: TypeScript types in oc-packages.`;

    const exportBlock =
        `export const metadata = {\n` +
        `    title: ${JSON.stringify(title)},\n` +
        `    description: ${JSON.stringify(description)},\n` +
        `};\n\n`;

    return (
        exportBlock +
        deprecationNotice(relPath) +
        escapeBracesOutsideCodeFences(stripLinkExtensions(fenceIndentedCode(body)))
    );
}

// JSDoc examples are written indented under their prose, and TypeDoc passes the
// indentation through. Two spaces is no code block in Markdown, so MDX set them as
// paragraphs: braces escaped, lines run together, and a long line or a box-drawn
// layout pushed a phone's page sideways. A run of indented lines between blank
// lines becomes a fenced block, dedented, unless it is a list, a list item's own
// paragraph, or holds a code span.
export function fenceIndentedCode(s) {
    const lines = s.split('\n');
    const indented = (l) => /^ {2,}\S/.test(l);
    const listItem = (l) => /^\s*(?:[-*+]|\d+[.)])\s/.test(l);
    const fence = (l) => /^\s*```/.test(l);
    const out = [];
    let inFence = false;
    let inList = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (fence(line)) inFence = !inFence;
        if (inFence || fence(line) || line.trim() === '') {
            out.push(line);
            continue;
        }
        if (listItem(line)) inList = true;
        else if (!indented(line)) inList = false;
        const opens = indented(line) && !listItem(line) && !inList && (i === 0 || lines[i - 1].trim() === '');
        if (!opens) {
            out.push(line);
            continue;
        }
        // The run: indented lines, and blank lines that have more of them after.
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '') continue;
            if (!indented(lines[j]) || fence(lines[j]) || listItem(lines[j])) break;
            end = j;
        }
        // A run with a backtick in it stays text. Its code spans are prose set in columns, or
        // TypeDoc's union lines (`\|`) with their links: a fence would print the backticks, and
        // stripping them would break a template literal in a real example.
        const run = lines.slice(i, end + 1);
        if (run.some((l) => l.includes('`')) || (end + 1 < lines.length && lines[end + 1].trim() !== '')) {
            out.push(line);
            continue;
        }
        const cut = Math.min(...run.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length));
        out.push('```', ...run.map((l) => l.slice(cut)), '```');
        i = end;
    }
    return out.join('\n');
}

function deprecationNotice(relPath) {
    const [pkg, file] = relPath.split(/[\\/]/);
    const text = file === 'README.mdx' ? DEPRECATED[pkg] : undefined;
    if (!text) return '';
    const lines = `**Deprecated.** ${text}`.split('\n');
    return lines.map((l) => `> ${l}`).join('\n') + '\n\n';
}

function escapeBracesOutsideCodeFences(s) {
    // Escape MDX-significant chars in prose so TypeDoc-rendered JSDoc that
    // contains shapes like `{ ok, sats }` or `<tool_use_id>` doesn't get
    // parsed as JSX expressions / HTML tags. Code fences (``` and inline
    // `code`) are passthrough — code is opaque in MDX.
    const out = [];
    let inFence = false;
    let inInline = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (
            c === '`' &&
            s[i + 1] === '`' &&
            s[i + 2] === '`' &&
            (i === 0 || s[i - 1] === '\n')
        ) {
            inFence = !inFence;
            out.push('```');
            i += 2;
            continue;
        }
        if (!inFence && c === '`') {
            inInline = !inInline;
            out.push(c);
            continue;
        }
        if (!inFence && c === '\n' && inInline) {
            inInline = false;
        }
        if (!inFence && !inInline) {
            if (c === '{') {
                out.push('&#123;');
                continue;
            }
            if (c === '}') {
                out.push('&#125;');
                continue;
            }
            if (c === '<') {
                // Escape all `<` outside fenced/inline code. TypeDoc emits
                // `<word>` placeholders in JSDoc prose ("Shape:" examples,
                // type-parameter references like `<T>`) plus inline `<a>`
                // anchors in tables. The placeholders break MDX parsing
                // (no closing tag); the anchors are nice-to-have but
                // expendable. Escaping universally is the safe call —
                // generated pages don't need raw HTML/JSX.
                out.push('&lt;');
                continue;
            }
        }
        out.push(c);
    }
    return out.join('');
}

// TypeDoc links sibling pages by file name (`interfaces/Poll.mdx`), but the
// site routes `/sdk/<pkg>/interfaces/Poll`: the .mdx path is a 404.
export function stripLinkExtensions(s) {
    return s.replace(/\]\((?![a-z][a-z0-9+.-]*:)([^)\s]*?)\.mdx(#[^)\s]*)?\)/gi, ']($1$2)');
}

function stripMd(s) {
    return s
        .replace(/\\(.)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_]/g, '')
        .trim();
}
