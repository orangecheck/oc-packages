import recording from '../fixtures/custody-records.json' with { type: 'json' };

/**
 * The public custody records ochk.io will publish (kind 30078), as key-spec's keys package
 * vectors give them (fixtures/custody-records.json names the commit): each record's envelope and
 * the tags it is published with. The OpenTimestamps proof a published envelope also carries is
 * left out; no reader here reads it.
 *
 * Every placement in RECORD_FORBIDDEN tags a record where a published reader asks for its own
 * events. A run with COMPAT_PLACEMENT set to one of those must fail.
 */

export interface CustodyRecord {
    name: string;
    tags: string[][];
    envelope: { record: string } & Record<string, string>;
}

export const custody = recording as unknown as {
    recorded_from: { repo: string; commit: string; file: string; vectors: string[] };
    records: CustodyRecord[];
};

/** The addresses a record names, from its own text. */
const addressesOf = (r: CustodyRecord) =>
    [...r.envelope.record.matchAll(/^(?:address|wallet): (\S+)$/gm)].map((m) => m[1]!);

export const RECORD_FORBIDDEN: Record<string, (r: CustodyRecord) => void> = {
    // The tag attest's address query reads (oc-attest SPEC §6.2).
    bare_address_tag: (r) => void r.tags.push(...addressesOf(r).map((a) => ['t', a])),
    // The tag attest's recent-attestations query reads.
    attest_marker_tag: (r) => void r.tags.push(['t', 'oc-attest']),
};

const placement = process.env.COMPAT_PLACEMENT?.trim() || 'identity_key';

/** Every record as an unsigned kind-30078 event, tagged as COMPAT_PLACEMENT says (key-spec's tags, by default). */
export function custodyEvents(createdAt: number) {
    return custody.records.map((source) => {
        const r = structuredClone(source);
        RECORD_FORBIDDEN[placement]?.(r);
        return { kind: 30078, created_at: createdAt, tags: r.tags, content: JSON.stringify(r.envelope) };
    });
}
