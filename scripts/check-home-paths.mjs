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

// A home path. In text it must not follow a host or path character, so URLs don't match.
// A colon is no boundary: a URL's is followed by "//", and a PATH list's entries count.
const HOME = '/(Users|home)/[A-Za-z0-9_.-]+/';
const PATTERN = `(^|[^A-Za-z0-9_./-])${HOME}`;

// git grep exits 1 when nothing matches; that is an empty answer, not a failure.
function grep(flags, pattern = PATTERN) {
    try {
        return execFileSync('git', ['grep', ...flags, pattern, '--', '.', ':!*.lock'], { encoding: 'utf8' });
    } catch (e) {
        if (e.status === 1) return '';
        throw e;
    }
}

const names = (out) => out.split('\n').filter(Boolean);

// Text files by line. A binary by name, with no boundary: a compiled file (a .pyc holds
// its source's path) puts a length byte before the path, and that byte can be any
// character the boundary refuses.
const lines = grep(['-nIE']);
const text = new Set(names(grep(['-lIE'], HOME)));
const binaries = names(grep(['-laE'], HOME)).filter((f) => !text.has(f));
if (lines || binaries.length) {
    process.stderr.write(lines + binaries.map((f) => `${f}: binary file\n`).join(''));
    console.error('::error::absolute home-directory path in a tracked file; use a repo-relative path or an env var');
    process.exit(1);
}
console.log('no absolute home-directory paths in tracked files');
