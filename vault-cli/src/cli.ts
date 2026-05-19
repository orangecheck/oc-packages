/**
 * @orangecheck/vault-cli — the `oc-vault` command.
 *
 *   oc-vault login                  — cache the escrow + ciphertext blobs
 *   oc-vault read ocv://…           — resolve one secret reference
 *   oc-vault run --env-file f -- …  — run a command with secrets in its env
 *   oc-vault inject -i tpl -o out   — fill ocv:// references in a template
 *   oc-vault item list | get <name> — browse entries
 *   oc-vault whoami                 — show the cached identity
 *
 * Zero-knowledge: the vault key is derived locally from the passphrase and
 * never leaves the process. See VAULT-DEVELOPER-PLATFORM.md.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { VaultClient } from '@orangecheck/vault-core';
import { Command } from 'commander';

import { parseEnvFile, readCache, scanRefs, writeCache, type VaultCache } from './config';
import { openVault, requireCache } from './vault';

const SECRET_FIELDS = new Set([
    'password',
    'secret',
    'key',
    'phrase',
    'cvv',
    'pin',
    'privateKey',
]);

function fail(message: string): never {
    console.error(`error: ${message}`);
    process.exit(1);
}

/** Build an API client from a token or a pasted `oc_session` cookie. */
function makeClient(baseUrl: string, token?: string, cookie?: string): VaultClient {
    return new VaultClient({
        baseUrl,
        token,
        headers: cookie ? { Cookie: `oc_session=${cookie}` } : undefined,
    });
}

/** Fetch the escrow + every ciphertext blob and assemble a fresh cache. */
async function pullCache(client: VaultClient, baseUrl: string, token?: string): Promise<VaultCache> {
    const escrow = await client.fetchEscrow();
    if (!escrow) fail('no vault is set up for this identity — create one at vault.ochk.io');
    const identity = await client.fetchIdentity();
    const refs = await client.listBlobs();
    const blobs = await client.fetchBlobs(refs);
    return {
        baseUrl,
        identity,
        escrow,
        blobs: blobs.map((b) => b.ciphertext),
        token,
        synced_at: new Date().toISOString(),
    };
}

const program = new Command();
program
    .name('oc-vault')
    .description('OC Vault from the shell — resolve ocv:// secret references, zero-knowledge.')
    .version('0.1.0');

program
    .command('login')
    .description('authenticate to vault.ochk.io and cache the escrow + ciphertext blobs')
    .option('--token <token>', 'an ocv_… access token (long-lived)')
    .option('--cookie <oc_session>', 'a pasted oc_session cookie value (interim, expires)')
    .option('--url <baseUrl>', 'API origin', 'https://vault.ochk.io')
    .action(async (opts: { token?: string; cookie?: string; url: string }) => {
        if (!opts.token && !opts.cookie) {
            fail('pass --token <ocv_…> or --cookie <oc_session value>');
        }
        const client = makeClient(opts.url, opts.token, opts.cookie);
        const cache = await pullCache(client, opts.url, opts.token);
        writeCache(cache);
        console.log(
            `Logged in${cache.identity ? ` as ${cache.identity}` : ''} · ` +
                `${cache.blobs.length} entries cached.`
        );
    });

program
    .command('sync')
    .description('refresh the cached ciphertext from vault.ochk.io')
    .option('--token <token>', 'an ocv_… access token')
    .option('--cookie <oc_session>', 'a pasted oc_session cookie value')
    .action(async (opts: { token?: string; cookie?: string }) => {
        const prev = requireCache();
        const token = opts.token ?? prev.token;
        if (!token && !opts.cookie) {
            fail('this session needs auth again — pass --token or --cookie');
        }
        const client = makeClient(prev.baseUrl, token, opts.cookie);
        const cache = await pullCache(client, prev.baseUrl, token);
        writeCache(cache);
        console.log(`Synced · ${cache.blobs.length} entries.`);
    });

program
    .command('read')
    .description('resolve one ocv:// secret reference and print its value')
    .argument('<reference>', 'an ocv://vault/item[/field] reference')
    .action(async (reference: string) => {
        const vault = await openVault(requireCache());
        try {
            console.log(vault.resolve(reference));
        } catch (err) {
            fail(err instanceof Error ? err.message : String(err));
        }
    });

program
    .command('run')
    .description('run a command with ocv:// references resolved into its environment')
    .option('--env-file <path>', 'a .env file of KEY=ocv://… references')
    .argument('[command...]', 'the command to run (after --)')
    .action(async (command: string[], opts: { envFile?: string }) => {
        if (command.length === 0) fail('nothing to run — usage: oc-vault run -- <command>');

        // Collect references: from --env-file, and from any inherited env
        // variable whose value is itself an ocv:// reference.
        const wanted: Record<string, string> = {};
        if (opts.envFile) {
            try {
                Object.assign(wanted, parseEnvFile(readFileSync(opts.envFile, 'utf8')));
            } catch {
                fail(`cannot read env file: ${opts.envFile}`);
            }
        }
        for (const [k, v] of Object.entries(process.env)) {
            if (typeof v === 'string' && v.startsWith('ocv://')) wanted[k] = v;
        }
        const refs = Object.entries(wanted).filter(([, v]) => v.startsWith('ocv://'));
        if (refs.length === 0) fail('no ocv:// references to resolve');

        const vault = await openVault(requireCache());
        const resolved: Record<string, string> = {};
        for (const [name, ref] of refs) {
            try {
                resolved[name] = vault.resolve(ref);
            } catch (err) {
                fail(`${name}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const child = spawn(command[0]!, command.slice(1), {
            stdio: 'inherit',
            env: { ...process.env, ...resolved },
        });
        child.on('error', (err) => fail(`could not run ${command[0]}: ${err.message}`));
        child.on('exit', (code) => process.exit(code ?? 1));
    });

program
    .command('inject')
    .description('fill every ocv:// reference in a template file')
    .requiredOption('-i, --in <path>', 'the template file')
    .option('-o, --out <path>', 'write here instead of stdout')
    .action(async (opts: { in: string; out?: string }) => {
        let template: string;
        try {
            template = readFileSync(opts.in, 'utf8');
        } catch {
            return fail(`cannot read template: ${opts.in}`);
        }
        const refs = [...new Set(scanRefs(template))];
        if (refs.length === 0) fail('no ocv:// references found in the template');

        const vault = await openVault(requireCache());
        let out = template;
        for (const ref of refs) {
            try {
                out = out.split(ref).join(vault.resolve(ref));
            } catch (err) {
                fail(`${ref}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        if (opts.out) {
            writeFileSync(opts.out, out);
            console.error(`Wrote ${opts.out} · ${refs.length} references resolved.`);
        } else {
            process.stdout.write(out);
        }
    });

const item = program.command('item').description('browse vault entries');

item
    .command('list')
    .description('list every entry — names, types, folders; no secrets')
    .action(async () => {
        const vault = await openVault(requireCache());
        const rows = vault.list();
        if (rows.length === 0) {
            console.log('(no entries)');
            return;
        }
        for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
            const folder = r.folder ? `  [${r.folder}]` : '';
            console.log(`${r.type.padEnd(12)} ${r.name}${folder}`);
        }
    });

item
    .command('get')
    .description('show one entry; secret fields are masked unless --reveal')
    .argument('<name>', 'an entry name or id')
    .option('--reveal', 'print secret field values in clear')
    .action(async (name: string, opts: { reveal?: boolean }) => {
        const vault = await openVault(requireCache());
        const found = vault.find(name);
        if (!found) fail(`no entry named "${name}"`);
        console.log(`${found.entry.name}  (${found.entry.type})`);
        const print = (label: string, value: string, secret: boolean): void => {
            const shown = secret && !opts.reveal ? '••••••••' : value;
            console.log(`  ${label.padEnd(16)} ${shown}`);
        };
        for (const [k, v] of Object.entries(found.fields)) {
            if (typeof v === 'string' && v) print(k, v, SECRET_FIELDS.has(k));
        }
        const custom = found.fields.custom;
        if (Array.isArray(custom)) {
            for (const c of custom as { label?: string; value?: string; secret?: boolean }[]) {
                if (c && typeof c.label === 'string' && typeof c.value === 'string') {
                    print(c.label, c.value, Boolean(c.secret));
                }
            }
        }
    });

program
    .command('whoami')
    .description('show the cached identity (no passphrase needed)')
    .action(() => {
        const cache = readCache();
        if (!cache) fail('not logged in — run `oc-vault login`');
        console.log(`identity   ${cache.identity ?? '(unknown)'}`);
        console.log(`endpoint   ${cache.baseUrl}`);
        console.log(`entries    ${cache.blobs.length}`);
        console.log(`synced     ${cache.synced_at}`);
    });

program.parseAsync(process.argv).catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
});
