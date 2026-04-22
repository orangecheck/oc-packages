import {
    discoverAttestations,
    getAttestationsForAddress,
    getAttestationsForIdentity,
    type AttestationEnvelope,
} from '@orangecheck/sdk';

import { die, exitWithJson, parseIdentity } from '../util';

export interface DiscoverArgs {
    addr?: string;
    id?: string;
    identity?: string;
    limit?: string;
    json?: boolean;
}

export async function runDiscover(args: DiscoverArgs): Promise<void> {
    if (!args.addr && !args.id && !args.identity) {
        die('must provide --addr, --id, or --identity');
    }

    let envelopes: AttestationEnvelope[] = [];
    if (args.id) {
        envelopes = await discoverAttestations({ attestationId: args.id });
    } else if (args.addr) {
        envelopes = await getAttestationsForAddress(args.addr);
    } else if (args.identity) {
        const { protocol, identifier } = parseIdentity(args.identity);
        envelopes = await getAttestationsForIdentity(protocol, identifier);
    }

    envelopes.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    const limit = args.limit ? Number(args.limit) : 50;
    const trimmed = envelopes.slice(0, limit);

    if (args.json) {
        exitWithJson({
            count: trimmed.length,
            total: envelopes.length,
            attestations: trimmed,
        });
    }

    if (trimmed.length === 0) {
        process.stdout.write('no attestations found\n');
        process.exit(0);
    }

    process.stdout.write(`${trimmed.length} of ${envelopes.length} attestation(s)\n\n`);
    for (const e of trimmed) {
        const idsStr = e.identities?.length
            ? e.identities.map((i) => `${i.protocol}:${i.identifier}`).join(', ')
            : '(no bindings)';
        process.stdout.write(
            [
                `  id:        ${e.attestation_id}`,
                `  address:   ${e.address}`,
                `  issued_at: ${e.issued_at}`,
                e.expires_at ? `  expires:   ${e.expires_at}` : null,
                `  scheme:    ${e.scheme}`,
                `  ids:       ${idsStr}`,
                '',
            ]
                .filter(Boolean)
                .join('\n')
        );
    }
    process.exit(0);
}
