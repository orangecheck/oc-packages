// Refuse a private key's PEM header in any commit about to be pushed.
//
// CI's secret scan (gitleaks, every commit, on a checkout that fetches every
// branch) fails on a private-key header, a fake one in a test fixture
// included. Once such a commit is pushed, no later commit takes it out of the
// history, and while its branch exists it fails the scan for every PR and for
// main. So land.sh runs this on the commits it is about to push, before the
// push. Write a multi-line test value that is not shaped like a key.
//
//   node scripts/check-key-fixtures.mjs <revision range, e.g. origin/main..HEAD>
import { spawnSync } from 'node:child_process';

/** gitleaks' private-key header, without the body it also needs: a header alone is enough to stop here. */
const KEY_HEADER = /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/;

/** Each added line in `range` that holds a key header, as { commit, file, line }. */
export function keyHeaders(range, cwd = process.cwd()) {
    const log = spawnSync('git', ['log', '-p', '-U0', '--no-color', '--format=commit %H', range], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
    if (log.status !== 0) throw new Error(`git log ${range} failed: ${log.stderr.trim()}`);
    const found = [];
    let commit = '';
    let file = '';
    for (const line of log.stdout.split('\n')) {
        if (line.startsWith('commit ')) commit = line.slice(7);
        else if (line.startsWith('+++ ')) file = line.replace(/^\+\+\+ (b\/)?/, '');
        else if (line.startsWith('+') && KEY_HEADER.test(line)) {
            found.push({ commit: commit.slice(0, 12), file, line: line.slice(1).trim() });
        }
    }
    return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const range = process.argv[2];
    if (!range) {
        console.error('usage: node scripts/check-key-fixtures.mjs <revision range>');
        process.exit(2);
    }
    const found = keyHeaders(range);
    if (found.length > 0) {
        for (const f of found) console.error(`${f.commit} ${f.file}: ${f.line}`);
        console.error(
            'a commit adds a private-key header. The history secret scan fails on it for good, ' +
                'and no later commit can take it back: rewrite the commit with a test value not shaped like a key.'
        );
        process.exit(1);
    }
}
