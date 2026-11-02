// Where a published object stands, from the relays that serve it back, each
// asked alone (quorum.ts). Never more than the read-back showed. Below
// min(2, asked) it says the object isn't in yet, gives the signed event to send
// again with `oc-vote republish`, and sets the exit status to NOT_IN_YET.

import type { NostrEvent } from './nostr.js';
import { isIn, writeQuorum } from './quorum.js';

/** Exit status when something was published but is not in yet. */
export const NOT_IN_YET = 2;

export type Kind = 'poll' | 'ballot' | 'reveal' | 'stamp';

/** A signed event this command published, and the relays that serve it back now. */
export interface Standing {
    kind: Kind;
    event: NostrEvent;
    relays: readonly string[];
    serving: readonly string[];
}

export function standingIsIn(s: Standing): boolean {
    return isIn(s.serving.length, s.relays.length);
}

function standingJson(s: Standing) {
    return { in: standingIsIn(s), served_by: s.serving, asked: s.relays.length, quorum: writeQuorum(s.relays.length) };
}

const LABEL: Record<Kind, string> = { poll: 'published:', ballot: 'in:', reveal: 'published:', stamp: 'stamp:' };
/** What missing every relay means for each kind's readers. */
const MISSED: Record<Kind, string> = {
    poll: 'so no one can find it',
    ballot: 'so a count would not see it',
    reveal: 'so a count would not see it',
    stamp: 'so a final count would not see it',
};
/** Who is sure to see it at the quorum. */
const SURE: Record<Kind, string> = {
    poll: 'it is sure to be found',
    ballot: 'a count is sure to see it',
    reveal: 'a count is sure to see it',
    stamp: 'a final count is sure to see it',
};

/** Where `s` stands, its relays one a line, and, below the quorum, how to send it again. */
export function standingLines(s: Standing, file?: string): string[] {
    const asked = s.relays.length;
    const n = s.serving.length;
    const label = `  ${LABEL[s.kind].padEnd(12)}`;
    const lines: string[] = [];
    if (standingIsIn(s)) {
        lines.push(`${label}yes, ${n} of ${asked} relays serve it back`);
        if (s.kind === 'stamp') lines.push(`              a Bitcoin block usually anchors it within an hour or two`);
    } else if (n === 0) {
        lines.push(`${label}not yet: no relay serves it back, ${MISSED[s.kind]}`);
    } else {
        lines.push(
            `${label}not yet: only ${n} of ${asked} relays serves it back, ` +
                `and ${SURE[s.kind]} only once ${writeQuorum(asked)} do`
        );
    }
    for (const relay of s.relays) lines.push(`    ${s.serving.includes(relay) ? '✓' : '✗'} ${relay}`);
    if (standingIsIn(s)) return lines;
    if (s.kind === 'stamp') lines.push(`              vote.ochk.io's anchorer also stamps every ballot it sees`);
    if (file) {
        lines.push(`  again:      oc-vote republish ${file}`);
        lines.push(`              sends the same signed ${s.kind}, with nothing new to sign`);
    } else {
        lines.push(`  again:      save the signed event below to a file and run oc-vote republish <file>;`);
        lines.push(`              it sends the same signed ${s.kind}, with nothing new to sign`);
        lines.push(`  event:      ${JSON.stringify(s.event)}`);
    }
    return lines;
}

export interface Report {
    /** The object's id line, e.g. ['ballot_id', '…']. */
    id: [string, string];
    heading?: [string, string][];
    main: Standing;
    /** A ballot's stamp in an anchored poll: where it stands, or why none was made. */
    stamp?: Standing | { error: string } | null;
    json: boolean;
    /** JSON fields after the standing and before `event`. */
    jsonExtra?: Record<string, unknown>;
    /** Human lines after the standing. */
    tail?: string[];
    /** The file the signed event came from, for the "again" line. */
    file?: string;
}

/** Writes where `r.main` (and its stamp) stand; NOT_IN_YET when either isn't in. */
export function report(r: Report): void {
    const stamp = r.stamp && 'kind' in r.stamp ? r.stamp : null;
    if (!standingIsIn(r.main) || (stamp && !standingIsIn(stamp))) process.exitCode = NOT_IN_YET;

    if (r.json) {
        const stampJson = r.stamp ? ('kind' in r.stamp ? { ...standingJson(r.stamp), event: r.stamp.event } : r.stamp) : null;
        process.stdout.write(
            JSON.stringify(
                {
                    [r.id[0]]: r.id[1],
                    ...standingJson(r.main),
                    ...(stampJson ? { stamp: stampJson } : {}),
                    ...r.jsonExtra,
                    event: r.main.event,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const lines = [`  ${`${r.id[0]}:`.padEnd(12)}${r.id[1]}`];
    for (const [k, v] of r.heading ?? []) lines.push(`  ${`${k}:`.padEnd(12)}${v}`);
    lines.push(...standingLines(r.main, r.file));
    if (stamp) lines.push(...standingLines(stamp));
    else if (r.stamp && 'error' in r.stamp) {
        lines.push(`  stamp:      not made here (${r.stamp.error}); vote.ochk.io's anchorer stamps every ballot it sees`);
    }
    lines.push(...(r.tail ?? []));
    process.stdout.write(`\n${lines.join('\n')}\n\n`);
}
