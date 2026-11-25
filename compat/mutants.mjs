// Runs the suite once as is, then once per forbidden placement of the custodial address and once
// with every reader hollowed out. The first run must pass and every other one must fail.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { FORBIDDEN } = await import('./src/account.ts');
const { RECORD_FORBIDDEN } = await import('./src/records.ts');
const { ME_FORBIDDEN } = await import('./src/me.ts');

const runs = [
    ['control', {}],
    ...[...Object.keys(FORBIDDEN), ...Object.keys(RECORD_FORBIDDEN), ...Object.keys(ME_FORBIDDEN)].map((p) => [p, { COMPAT_PLACEMENT: p }]),
    ['hollow (every import undefined)', { COMPAT_HOLLOW: '1' }],
];

const dir = mkdtempSync(join(tmpdir(), 'compat-mutants-'));
let bad = 0;
for (const [name, env] of runs) {
    const out = join(dir, 'run.json');
    spawnSync(
        'npx',
        ['vitest', 'run', '--maxWorkers=2', '--reporter=json', `--outputFile=${out}`],
        { env: { ...process.env, ...env }, stdio: 'ignore' }
    );
    let r;
    try {
        r = JSON.parse(readFileSync(out, 'utf8'));
    } catch {
        r = null;
    }
    const failed = (r?.testResults ?? []).flatMap((f) =>
        f.assertionResults.filter((a) => a.status === 'failed').map((a) => a.fullName)
    );
    const fileErrors = (r?.testResults ?? []).filter((f) => f.status === 'failed' && f.assertionResults.length === 0);
    const passed = r?.numPassedTests ?? 0;
    const ok = name === 'control' ? r !== null && r.success && passed > 0 : r === null || !r.success;
    if (!ok) bad++;
    const verdict = name === 'control' ? (ok ? 'passes' : 'FAILS') : ok ? 'killed' : 'SURVIVED';
    console.log(`${name}: ${verdict} (${passed} passed, ${failed.length} failed${fileErrors.length ? `, ${fileErrors.length} files errored` : ''})`);
    for (const t of failed) console.log(`    ${t}`);
    for (const f of fileErrors) console.log(`    file: ${f.name.split('/compat/')[1]}: ${f.message?.split('\n')[0]}`);
}
rmSync(dir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
