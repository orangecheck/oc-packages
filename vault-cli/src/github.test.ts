import { describe, expect, it } from 'vitest';

import { githubExport, maskCommands } from './github';

// A key that spans lines, with CRLF endings, a blank line and a `%`.
const PEM = [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
    '',
    'QyNTUxOQAAACB%0Aliteral-percent-0A-not-a-newline',
    '-----END OPENSSH PRIVATE KEY-----',
].join('\r\n');
const lines = PEM.split(/\r?\n/).filter((l) => l !== '');
// How the runner reads command data back (ActionCommand unescape): %0D, %0A, then %25.
const runnerReads = (data: string) =>
    data.replace(/%0D/g, '\r').replace(/%0A/g, '\n').replace(/%25/g, '%');

describe('export --github masking', () => {
    it('masks every non-empty line of a multi-line value, one command each', () => {
        const masks = maskCommands(PEM);
        expect(masks).toHaveLength(lines.length);
        // Read back as the runner reads it, each mask names its line exactly.
        expect(masks.map((m) => runnerReads(m.slice('::add-mask::'.length)))).toEqual(lines);
    });

    it('prints nothing of a value except its mask commands', () => {
        const { stdout } = githubExport([
            ['DEPLOY_KEY', PEM],
            ['TOKEN', 'single-line-token'],
        ]);
        expect(stdout.every((l) => l.startsWith('::add-mask::'))).toBe(true);
        expect(stdout).toHaveLength(lines.length + 1);
        // No line of a value appears on stdout outside a mask command.
        for (const line of [...lines, 'single-line-token']) {
            expect(
                stdout.filter(
                    (l) => l.includes(line.slice(0, 20)) && !l.startsWith('::add-mask::'),
                ),
            ).toEqual([]);
        }
        expect(stdout.join('\n')).not.toContain('\r');
    });

    it('writes each value whole to $GITHUB_ENV in a heredoc', () => {
        const { env } = githubExport([['DEPLOY_KEY', PEM]], () => 'OCV_X');
        expect(env).toBe(`DEPLOY_KEY<<OCV_X\n${PEM}\nOCV_X\n`);
    });

    it('masks each side of a lone \\r, as the runner splits log lines there too', () => {
        // A trailing \r would leave 'tokenXYZ' logged but 'tokenXYZ\r' masked.
        expect(maskCommands('tokenXYZ\r')).toEqual(['::add-mask::tokenXYZ']);
        expect(maskCommands('secretA\rsecretB')).toEqual([
            '::add-mask::secretA',
            '::add-mask::secretB',
        ]);
        expect(maskCommands('a\r\nb\rc\nd')).toEqual([
            '::add-mask::a',
            '::add-mask::b',
            '::add-mask::c',
            '::add-mask::d',
        ]);
    });

    it('masks nothing for an empty value, and skips blank lines', () => {
        expect(maskCommands('')).toEqual([]);
        expect(maskCommands('a\n\n  \nb')).toEqual(['::add-mask::a', '::add-mask::b']);
    });
});
