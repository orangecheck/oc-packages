/**
 * No tracked file may carry an absolute path into someone's home directory
 * (a Users or home directory at the filesystem root). Such a path names a
 * person in a public repository and works on one machine only. Use a path
 * relative to the repository, or an environment variable.
 *
 * Usage: node scripts/check-home-paths.mjs
 */

import { execFileSync } from 'node:child_process';

// A home path not preceded by a host or path character, so URLs don't match.
const PATTERN = '(^|[^A-Za-z0-9_.:/-])/(Users|home)/[A-Za-z0-9_.-]+/';

try {
    const hits = execFileSync('git', ['grep', '-nIE', PATTERN, '--', '.', ':!*.lock'], {
        encoding: 'utf8',
    });
    process.stderr.write(hits);
    console.error('::error::absolute home-directory path in a tracked file; use a repo-relative path or an env var');
    process.exit(1);
} catch (e) {
    // git grep exits 1 when nothing matches.
    if (e.status === 1) {
        console.log('no absolute home-directory paths in tracked files');
        process.exit(0);
    }
    throw e;
}
