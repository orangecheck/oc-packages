/** A release in CHANGELOG.md: its version, its date and the opening sentence of each thing it changed. */
export interface Release {
    version: string;
    date?: string;
    lines: string[];
}

const opening = (p: string) => {
    const flat = p.replace(/\s*\n\s*/g, ' ');
    return flat.match(/^.*?[.:](?=\s|$)/)?.[0] ?? flat;
};

/** CHANGELOG.md's releases, newest first: each stanza's opening sentence, or each top-level bullet's when a release is bullets only. */
export function readReleases(md: string): Release[] {
    return md
        .split(/^## /m)
        .slice(1)
        .flatMap((part) => {
            const [head = '', ...rest] = part.split('\n');
            const m = /^\[([^\]]+)\](?:\s+—\s+(\d{4}-\d{2}-\d{2}))?/.exec(head);
            if (!m?.[1]) return [];
            const stanzas = rest.join('\n').trim().split(/\n[ \t]*\n/);
            let lines = stanzas.filter((p) => /^[^\s\-*#|>`]/.test(p)).map(opening);
            if (!lines.length) lines = stanzas.flatMap((p) => p.split(/^[-*] /m).slice(1)).map(opening);
            return lines.length ? [{ version: m[1], date: m[2], lines }] : [];
        });
}
