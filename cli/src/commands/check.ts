import { check } from '@orangecheck/sdk';

import { die, exitWithJson, parseIdentity } from '../util';

export interface CheckArgs {
    addr?: string;
    id?: string;
    identity?: string;
    minSats?: string;
    minDays?: string;
    json?: boolean;
}

export async function runCheck(args: CheckArgs): Promise<void> {
    if (!args.addr && !args.id && !args.identity) {
        die('must provide --addr, --id, or --identity');
    }

    const params: Parameters<typeof check>[0] = {
        minSats: args.minSats ? Number(args.minSats) : 0,
        minDays: args.minDays ? Number(args.minDays) : 0,
    };
    if (args.id) params.id = args.id;
    else if (args.addr) params.addr = args.addr;
    else if (args.identity) params.identity = parseIdentity(args.identity);

    const result = await check(params);

    if (args.json) exitWithJson(result, result.ok ? 0 : 2);

    // Human-friendly output
    const mark = result.ok ? '\u2713' : '\u2717';
    process.stdout.write(`${mark} ${result.ok ? 'pass' : 'fail'}\n`);
    process.stdout.write(`  sats:  ${result.sats.toLocaleString()}\n`);
    process.stdout.write(`  days:  ${result.days}\n`);
    process.stdout.write(`  score: ${result.score}\n`);
    if (result.attestation_id) {
        process.stdout.write(`  id:    ${result.attestation_id}\n`);
    }
    if (result.address) {
        process.stdout.write(`  addr:  ${result.address}\n`);
    }
    if (result.identities?.length) {
        process.stdout.write(
            `  ids:   ${result.identities.map((i) => `${i.protocol}:${i.identifier}`).join(', ')}\n`
        );
    }
    if (result.reasons?.length) {
        process.stdout.write(`  reasons: ${result.reasons.join(', ')}\n`);
    }
    process.exit(result.ok ? 0 : 2);
}
