// A test run's temp files go in one folder of its own, removed when the run ends.
// vitest: list this file in globalSetup. node:test: call useTmpRoot(after) at the top of the file.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Points TMPDIR at a fresh folder; the function it returns removes the folder and puts TMPDIR back. */
export default function setup() {
    const before = process.env.TMPDIR;
    const root = mkdtempSync(join(tmpdir(), 'oc-test-run-'));
    process.env.TMPDIR = root;
    return () => {
        if (before === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = before;
        rmSync(root, { recursive: true, force: true });
    };
}

/** node:test: the same folder for this file's run, removed in after(). */
export function useTmpRoot(after) {
    after(setup());
}
