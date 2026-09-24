/**
 * The post-process gen-docs.mjs applies to TypeDoc output, shared with
 * drift-check.mjs so the two cannot diverge.
 */

export function mdxTransform(raw) {
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

    return exportBlock + escapeBracesOutsideCodeFences(stripLinkExtensions(body));
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
