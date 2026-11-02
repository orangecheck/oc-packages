// `oc-vault export --github`: load resolved secrets into a GitHub Actions job.
//
// GitHub reads workflow commands one line at a time, so `::add-mask::` with a
// multi-line value masks only its first line, and the rest print into the job
// log in clear. Each non-empty line of every value is masked on its own line,
// before the value is written anywhere. Nothing else of a value is printed.

import { randomUUID } from 'node:crypto';

/**
 * Command data as the runner reads it back: it unescapes %25, %0D and %0A, so a
 * literal `%` (or `\r`) is escaped or the mask would name a different string.
 */
function escapeCommandData(s: string): string {
    return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** One `::add-mask::` per non-empty line of `value`. */
export function maskCommands(value: string): string[] {
    return value
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => `::add-mask::${escapeCommandData(line)}`);
}

/**
 * What `export --github` prints (mask commands only) and appends to $GITHUB_ENV
 * (heredoc blocks, safe for multi-line values).
 */
export function githubExport(
    resolved: readonly (readonly [string, string])[],
    delimiter: () => string = () => `OCV_${randomUUID()}`,
): { stdout: string[]; env: string } {
    const stdout: string[] = [];
    let env = '';
    for (const [name, value] of resolved) {
        stdout.push(...maskCommands(value));
        const delim = delimiter();
        env += `${name}<<${delim}\n${value}\n${delim}\n`;
    }
    return { stdout, env };
}
