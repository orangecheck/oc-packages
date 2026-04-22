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
 *   OC_CACHE_TTL_MS   — cache TTL in ms (default: 60000)
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

import type { FilterOptions, MinimalNostrEvent } from './types';

import { createInterface } from 'node:readline';

import { filterEvent } from './filter';

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
        relays: parseList(env.OC_RELAYS),
        failOpen: env.OC_FAIL_OPEN === 'true',
        cacheTtlMs: env.OC_CACHE_TTL_MS ? Number(env.OC_CACHE_TTL_MS) : 60_000,
        onDecision: (event, decision) => {
            if (env.OC_LOG !== 'false') {
                process.stderr.write(
                    `[oc-strfry] ${decision.action} ${event.kind} ${event.pubkey.slice(0, 12)}… (${decision.reason})\n`
                );
            }
        },
    };
}

interface StrfryInput {
    type: 'new' | 'lookback';
    event?: MinimalNostrEvent;
    receivedAt?: number;
    sourceType?: string;
    sourceInfo?: string;
}

async function handleLine(line: string, options: FilterOptions): Promise<string | null> {
    let input: StrfryInput;
    try {
        input = JSON.parse(line);
    } catch {
        return null;
    }

    // Only inspect new events — lookback events are already stored.
    if (input.type !== 'new' || !input.event) {
        return JSON.stringify({
            id: input.event?.id ?? '',
            action: 'accept',
        });
    }

    const decision = await filterEvent(input.event, options);
    return JSON.stringify({
        id: input.event.id,
        action: decision.action,
        ...(decision.message ? { msg: decision.message } : {}),
    });
}

async function main(): Promise<void> {
    const options = optionsFromEnv();
    const rl = createInterface({ input: process.stdin, terminal: false });

    for await (const line of rl) {
        if (!line.trim()) continue;
        const out = await handleLine(line, options);
        if (out) process.stdout.write(out + '\n');
    }
}

main().catch((err) => {
    process.stderr.write(`[oc-strfry] fatal: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
});

export { filterEvent } from './filter';
export type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';
