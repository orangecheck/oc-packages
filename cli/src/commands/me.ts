/**
 * `oc me ...` — me.ochk.io integrator commands.
 *
 *   oc me init --archetype saas-paywall --project-key pk_live_x --domain example.com --name "Example"
 *      Scaffolds a complete IntegratorPriceConfig from one of the
 *      curated archetypes (saas-paywall, marketplace, content-platform,
 *      gaming, agent-only) and writes it to ./oc-config.json (or the
 *      path supplied via --out).
 *
 *   oc me archetypes
 *      Lists every available archetype with its summary + examples.
 *      Useful when you don't yet know which template fits your site.
 *
 *   oc me validate-config [<file>]
 *      Validates an IntegratorPriceConfig file against the platform's
 *      non-negotiable rules (min sat floor, percent ranges,
 *      user_share_pct ≤ 0.8). Reads stdin when <file> is omitted.
 *
 *   oc me test-fire <project_key> <subtype>
 *      Fires a single billable envelope from a terminal. Useful for
 *      smoke-testing webhook receive handlers before wiring the SDK
 *      into your app code. Requires OC_BEARER_TOKEN env or --token.
 *
 *   oc me subtypes
 *      Lists every billable event subtype with its class, description,
 *      and typical price hint. Helps integrators map their flows to
 *      the canonical subtype taxonomy.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
    ALL_EVENT_SUBTYPES,
    ARCHETYPE_TEMPLATES,
    configFromTemplate,
    EVENT_SUBTYPES,
    validateIntegratorConfig,
    type IntegratorArchetype,
    type IntegratorPriceConfig,
} from '@orangecheck/me-client';

import { die, exitWithJson, readStdin } from '../util';

const ME_ORIGIN_DEFAULT = 'https://me.ochk.io';

interface InitOpts {
    archetype: string;
    projectKey: string;
    domain: string;
    name: string;
    out?: string;
    json?: boolean;
}

export async function runMeInit(opts: InitOpts): Promise<void> {
    if (!opts.archetype) die('--archetype required (run `oc me archetypes` to list)');
    if (!opts.projectKey) die('--project-key required');
    if (!opts.domain) die('--domain required');
    if (!opts.name) die('--name required');
    const validIds = ARCHETYPE_TEMPLATES.map((t) => t.id);
    if (!validIds.includes(opts.archetype as IntegratorArchetype)) {
        die(`unknown archetype "${opts.archetype}". Valid: ${validIds.join(', ')}`);
    }

    const cfg = configFromTemplate(opts.archetype as IntegratorArchetype, {
        project_key: opts.projectKey,
        domain: opts.domain,
        display_name: opts.name,
    });

    const outPath = resolve(process.cwd(), opts.out ?? 'oc-config.json');
    await writeFile(outPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

    if (opts.json) {
        exitWithJson({ ok: true, written: outPath, config: cfg });
    }
    process.stdout.write(`✓ wrote ${outPath}\n`);
    process.stdout.write(`  archetype:  ${opts.archetype}\n`);
    process.stdout.write(`  project:    ${opts.projectKey}\n`);
    process.stdout.write(`  domain:     ${opts.domain}\n`);
    const enabledCount = Object.values(cfg.events).filter((e) => e?.enabled).length;
    process.stdout.write(`  enabled:    ${enabledCount} of ${ALL_EVENT_SUBTYPES.length} subtypes\n`);
    process.stdout.write(
        `\nnext: review ${outPath}, then submit via the dashboard at me.ochk.io/me/projects.\n`
    );
}

export function runMeArchetypes(opts: { json?: boolean }): void {
    if (opts.json) {
        exitWithJson({ ok: true, archetypes: ARCHETYPE_TEMPLATES });
    }
    process.stdout.write('Available archetypes:\n\n');
    for (const t of ARCHETYPE_TEMPLATES) {
        process.stdout.write(`  ${t.id}\n`);
        process.stdout.write(`    ${t.label} · ${t.summary}\n`);
        const enabled = Object.entries(t.events)
            .filter(([, c]) => c?.enabled)
            .map(([s]) => s);
        process.stdout.write(`    enabled: ${enabled.join(', ')}\n`);
        process.stdout.write(`    examples: ${t.examples.join(' · ')}\n\n`);
    }
    process.stdout.write('use: oc me init --archetype <id> --project-key <pk> --domain <d> --name <n>\n');
}

export function runMeSubtypes(opts: { json?: boolean }): void {
    if (opts.json) {
        exitWithJson({ ok: true, subtypes: ALL_EVENT_SUBTYPES });
    }
    process.stdout.write('Billable event subtypes:\n\n');
    let lastClass = '';
    for (const meta of ALL_EVENT_SUBTYPES) {
        if (meta.class !== lastClass) {
            const classLabel =
                meta.class === 'A'
                    ? 'class A · durable state transitions'
                    : meta.class === 'B'
                      ? 'class B · action-bound'
                      : 'class C · session';
            process.stdout.write(`\n[${classLabel}]\n`);
            lastClass = meta.class;
        }
        process.stdout.write(`  ${meta.id}\n`);
        process.stdout.write(`    fires when: ${meta.fires_when}\n`);
        process.stdout.write(`    example:    ${meta.example}\n`);
        process.stdout.write(`    price hint: ${meta.typical_price_hint}\n\n`);
    }
}

interface ValidateOpts {
    file?: string;
    json?: boolean;
}

export async function runMeValidateConfig(opts: ValidateOpts): Promise<void> {
    let raw: string;
    if (opts.file) {
        raw = await readFile(resolve(process.cwd(), opts.file), 'utf8');
    } else {
        raw = await readStdin();
        if (!raw) die('no config file given and stdin is empty (try `cat config.json | oc me validate-config`)');
    }
    let cfg: IntegratorPriceConfig;
    try {
        cfg = JSON.parse(raw) as IntegratorPriceConfig;
    } catch (err) {
        die(`config is not valid JSON: ${(err as Error).message}`);
    }
    const result = validateIntegratorConfig(cfg);
    if (opts.json) {
        exitWithJson({ ok: result.ok, errors: result.errors }, result.ok ? 0 : 1);
    }
    if (result.ok) {
        const enabledCount = Object.values(cfg.events).filter((e) => e?.enabled).length;
        process.stdout.write(`✓ valid · ${enabledCount} subtype(s) enabled · ready to submit\n`);
        return;
    }
    process.stderr.write('✗ config has errors:\n');
    for (const err of result.errors) {
        const prefix = err.subtype ? `  [${err.subtype}] ` : '  ';
        process.stderr.write(`${prefix}${err.message}\n`);
    }
    process.exit(1);
}

interface TestFireOpts {
    projectKey: string;
    subtype: string;
    actionLabel?: string;
    paymentAmountSats?: string;
    origin?: string;
    token?: string;
    json?: boolean;
}

export async function runMeTestFire(opts: TestFireOpts): Promise<void> {
    if (!opts.projectKey) die('project_key required');
    if (!opts.subtype) die('subtype required (run `oc me subtypes` to list)');
    const meta = EVENT_SUBTYPES[opts.subtype as keyof typeof EVENT_SUBTYPES];
    if (!meta) {
        die(`unknown subtype "${opts.subtype}" · run \`oc me subtypes\` to list valid options`);
    }
    const token = opts.token ?? process.env.OC_BEARER_TOKEN;
    if (!token) die('OC_BEARER_TOKEN env var required (or pass --token)');
    const origin = opts.origin ?? process.env.OC_ORIGIN ?? ME_ORIGIN_DEFAULT;

    const body = {
        project_key: opts.projectKey,
        subtype: opts.subtype,
        action_label: opts.actionLabel ?? `cli test-fire · ${new Date().toISOString()}`,
        ...(opts.paymentAmountSats
            ? { payment_amount_sats: Number(opts.paymentAmountSats) }
            : {}),
    };

    const url = `${origin}/api/integrator/event`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        die(`network error reaching ${url}: ${(err as Error).message}`);
    }
    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        die(`response was not JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    if (opts.json) {
        exitWithJson({ ok: res.ok, status: res.status, response: json }, res.ok ? 0 : 1);
    }
    if (!res.ok) {
        process.stderr.write(`✗ ${res.status} · ${JSON.stringify(json)}\n`);
        process.exit(1);
    }
    const envelope = (json as { envelope?: { id: string; verify_url?: string } }).envelope;
    if (envelope) {
        process.stdout.write(`✓ envelope ${envelope.id}\n`);
        if (envelope.verify_url) {
            process.stdout.write(`  verify: ${envelope.verify_url}\n`);
        }
    } else {
        process.stdout.write(`✓ ${res.status}\n  ${JSON.stringify(json)}\n`);
    }
}
