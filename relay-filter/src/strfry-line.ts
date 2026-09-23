import type { AttestationIndex } from './attestation-index';
import type { FilterOptions, MinimalNostrEvent } from './types';

interface StrfryInput {
    type: 'new' | 'lookback';
    event?: MinimalNostrEvent;
    receivedAt?: number;
    sourceType?: string;
    sourceInfo?: string;
}

const HEX_64_RE = /^[0-9a-f]{64}$/;

export function handleLine(line: string, index: AttestationIndex, options: FilterOptions): string | null {
    let input: StrfryInput;
    try {
        input = JSON.parse(line);
    } catch {
        return null;
    }

    // Lookback events are already stored; skip entirely so we don't emit a
    // malformed echo (Strfry expects the id to match the input event).
    if (input.type !== 'new') {
        return null;
    }
    if (!input.event || typeof input.event !== 'object') {
        return null;
    }

    // Validate event shape before it reaches the filter — otherwise a
    // malformed `pubkey` becomes a cache-poisoning vector (a bogus key like
    // `undefined` shares a cache entry with every future malformed event).
    const ev = input.event;
    if (
        typeof ev.id !== 'string' ||
        typeof ev.pubkey !== 'string' ||
        typeof ev.kind !== 'number' ||
        !HEX_64_RE.test(ev.id) ||
        !HEX_64_RE.test(ev.pubkey)
    ) {
        return JSON.stringify({
            id: typeof ev.id === 'string' ? ev.id : '',
            action: 'reject',
            msg: 'orangecheck: malformed event shape',
        });
    }

    const decision = index.decide(ev, options);
    if (process.env.OC_LOG !== 'false') {
        process.stderr.write(
            `[oc-strfry] ${decision.action} ${ev.kind} ${ev.pubkey.slice(0, 12)}… (${decision.reason})\n`
        );
    }
    return JSON.stringify({
        id: ev.id,
        action: decision.action,
        ...(decision.message ? { msg: decision.message } : {}),
    });
}

