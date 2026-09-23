/**
 * Strfry policy plugin for OrangeCheck.
 *
 * tsup adds `#!/usr/bin/env node` automatically because this file is listed
 * under `bin` in package.json.
 *
 * Configure Strfry with the path to this binary and it will filter EVENT
 * submissions against OrangeCheck thresholds.
 *
 * Strfry's policy plugin protocol:
 *   - read JSON lines from stdin; one line per inbound event
 *   - each line has shape: { type: "new", event: {...}, ... }
 *   - emit one JSON line per decision:
 *       { id: "<event_id>", action: "accept"|"reject"|"shadowReject", msg?: "..." }
 *
 * Runtime config — set via environment variables (env is the cleanest way
 * to pass policy into a plugin Strfry spawns on your behalf):
 *
 *   OC_MIN_SATS       — minimum sats bonded (default: 0)
 *   OC_MIN_DAYS       — minimum days unspent (default: 0)
 *   OC_ALLOW_KINDS    — comma-separated kinds to bypass (default: "0,3,10002")
 *   OC_ALLOW_PUBKEYS  — comma-separated hex pubkeys to bypass (default: none)
 *   OC_FAIL_OPEN      — "true" to allow events through on lookup failure
 *   OC_RELAYS         — comma-separated Nostr relay URLs (default: SDK defaults)
 *   OC_REFRESH_MS     — how often each bond is re-read from the chain (default: 600000)
 *
 * Usage with Strfry:
 *
 *   // strfry.conf
 *   writePolicy = {
 *     plugin = "/usr/local/bin/oc-strfry"
 *   }
 *
 * Or via npx during development:
 *
 *   writePolicy = { plugin = "npx -y @orangecheck/relay-filter" }
 *
 * (Strfry docs: https://github.com/hoytech/strfry)
 */

import type { FilterOptions } from './types';

import { createInterface } from 'node:readline';

import { AttestationIndex } from './attestation-index';
import { handleLine } from './strfry-line';

function parseList(raw: string | undefined): string[] | undefined {
    if (!raw) return undefined;
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseNumList(raw: string | undefined): number[] | undefined {
    const list = parseList(raw);
    if (!list) return undefined;
    return list.map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

function optionsFromEnv(): FilterOptions {
    const env = process.env;
    return {
        minSats: env.OC_MIN_SATS ? Number(env.OC_MIN_SATS) : 0,
        minDays: env.OC_MIN_DAYS ? Number(env.OC_MIN_DAYS) : 0,
        allowKinds: parseNumList(env.OC_ALLOW_KINDS) ?? [0, 3, 10002],
        allowPubkeys: parseList(env.OC_ALLOW_PUBKEYS),
        failOpen: env.OC_FAIL_OPEN === 'true',
    };
}

async function main(): Promise<void> {
    const options = optionsFromEnv();
    const index = new AttestationIndex({
        relays: parseList(process.env.OC_RELAYS),
        refreshMs: process.env.OC_REFRESH_MS ? Number(process.env.OC_REFRESH_MS) : undefined,
    });
    index.start();
    const rl = createInterface({ input: process.stdin, terminal: false });

    for await (const line of rl) {
        if (!line.trim()) continue;
        // Per-line isolation: a single throw here used to kill the whole
        // plugin (and then Strfry's default fallback determined whether the
        // relay accepted or rejected every subsequent event). Catch and emit
        // an explicit reject instead.
        try {
            const out = handleLine(line, index, options);
            if (out) process.stdout.write(out + '\n');
        } catch (err) {
            let id = '';
            try {
                const parsed = JSON.parse(line);
                if (parsed?.event?.id && typeof parsed.event.id === 'string') {
                    id = parsed.event.id.slice(0, 64);
                }
            } catch {
                // leave id empty
            }
            process.stderr.write(
                `[oc-strfry] handleLine threw: ${err instanceof Error ? err.message : String(err)}\n`
            );
            process.stdout.write(
                JSON.stringify({
                    id,
                    action: 'reject',
                    msg: 'orangecheck: filter error',
                }) + '\n'
            );
        }
    }
}

main().catch((err) => {
    process.stderr.write(`[oc-strfry] fatal: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});

export type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';
