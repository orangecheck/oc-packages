/**
 * No tracked file may carry an absolute path into someone's home directory
 * (a Users or home directory at the filesystem root). Such a path names a
 * person in a public repository and works on one machine only, and a binary
 * file (a compiled .pyc) carries one as surely as source does. Use a path
 * relative to the repository, or an environment variable.
 *
 * Usage: node scripts/check-home-paths.mjs
 */

import { execFileSync } from 'node:child_process';

// A home path not preceded by a host or path character, so URLs don't match.
const PATTERN = '(^|[^A-Za-z0-9_.:/-])/(Users|home)/[A-Za-z0-9_.-]+/';

// git grep exits 1 when nothing matches; that is an empty answer, not a failure.
function grep(flags) {
    try {
        return execFileSync('git', ['grep', ...flags, PATTERN, '--', '.', ':!*.lock'], { encoding: 'utf8' });
    } catch (e) {
        if (e.status === 1) return '';
        throw e;
    }
}

// Text files by line; every file by name, binaries included, since a compiled file
// (a .pyc holds its source's path) is as public as the source.
const lines = grep(['-nIE']);
const text = new Set(grep(['-lIE']).split('\n').filter(Boolean));
const binaries = grep(['-laE']).split('\n').filter((f) => f && !text.has(f));
if (lines || binaries.length) {
    process.stderr.write(lines + binaries.map((f) => `${f}: binary file\n`).join(''));
    console.error('::error::absolute home-directory path in a tracked file; use a repo-relative path or an env var');
    process.exit(1);
}
console.log('no absolute home-directory paths in tracked files');
