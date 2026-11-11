// scripts/test-tmp-root.mjs: a run's temp files land in its own folder, and the folder goes when the run ends.
//
//   node --test scripts/test-tmp-root.test.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import setup from './test-tmp-root.mjs';

const MODULE = new URL('./test-tmp-root.mjs', import.meta.url).href;

/** Runs `body` with TMPDIR at an empty folder of its own; returns that folder's entries afterwards. */
function inEmptyTmp(body) {
    const outer = mkdtempSync(join(tmpdir(), 'tmp-root-test-'));
    const before = process.env.TMPDIR;
    process.env.TMPDIR = outer;
    try {
        body(outer);
        return readdirSync(outer);
    } finally {
        if (before === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = before;
        rmSync(outer, { recursive: true, force: true });
    }
}

test('a run writes under its own folder, and teardown removes it and restores TMPDIR', () => {
    const left = inEmptyTmp((outer) => {
        const teardown = setup();
        const root = tmpdir();
        assert.notEqual(root, outer);
        assert.equal(join(root, '..'), outer);
        const made = mkdtempSync(join(tmpdir(), 'made-'));
        writeFileSync(join(made, 'f'), 'x');
        teardown();
        assert.equal(tmpdir(), outer);
        assert.equal(existsSync(root), false);
    });
    assert.deepEqual(left, []);
});

test('a child process the run starts writes under the same folder', () => {
    const left = inEmptyTmp(() => {
        const teardown = setup();
        const child = spawnSync(process.execPath, [
            '-e',
            "const fs=require('fs'),os=require('os'),p=require('path');fs.mkdtempSync(p.join(os.tmpdir(),'child-'));process.stdout.write(os.tmpdir())",
        ]);
        assert.equal(String(child.stdout), tmpdir());
        teardown();
    });
    assert.deepEqual(left, []);
});

test('useTmpRoot leaves nothing behind once a node:test file ends', () => {
    const left = inEmptyTmp(() => {
        const file = join(tmpdir(), 'uses-root.test.mjs');
        writeFileSync(
            file,
            [
                `import { after, test } from 'node:test';`,
                `import { mkdtempSync } from 'node:fs';`,
                `import { tmpdir } from 'node:os';`,
                `import { join } from 'node:path';`,
                `import { useTmpRoot } from ${JSON.stringify(MODULE)};`,
                `useTmpRoot(after);`,
                `test('makes a folder', () => { mkdtempSync(join(tmpdir(), 'inner-')); });`,
            ].join('\n'),
        );
        // Without NODE_TEST_CONTEXT, so the inner node --test runs its file instead of skipping it.
        const { NODE_TEST_CONTEXT: _parent, ...env } = process.env;
        const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
            encoding: 'utf8',
            env,
        });
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.match(run.stdout, /^# pass 1$/m, run.stdout);
        rmSync(file);
    });
    assert.deepEqual(left, []);
});
