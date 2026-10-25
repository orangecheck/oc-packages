import type { IndexOptions } from './attestation-index';
import type { FilterOptions } from './types';

/** The options `filterEvent` and `AttestationIndex.decide` read. */
const FILTER_OPTIONS: ReadonlySet<string> = new Set<keyof FilterOptions>([
    'minSats',
    'minDays',
    'allowKinds',
    'allowPubkeys',
    'cacheTtlMs',
    'cacheMax',
    'failOpen',
    'relays',
    'onDecision',
]);

/** The options `new AttestationIndex()` reads. */
const INDEX_OPTIONS: ReadonlySet<string> = new Set<keyof IndexOptions>(['relays', 'refreshMs', 'minSats']);

/**
 * Throw on a key the filter does not read. Ignored, a misspelt `minSats`
 * would leave the threshold at 0 and the relay would accept every attested key.
 */
function refuseUnknown(where: string, opts: unknown, known: ReadonlySet<string>): void {
    if (opts === null || typeof opts !== 'object') {
        throw new TypeError(`@orangecheck/relay-filter: ${where} options must be an object`);
    }
    const unknown = Object.keys(opts).filter((k) => !known.has(k));
    if (unknown.length > 0) {
        throw new TypeError(
            `@orangecheck/relay-filter: unknown option ${unknown.join(', ')}. ` +
                `${where} reads only ${[...known].join(', ')}.`
        );
    }
    // Readers read opts.key, which follows the prototype: a known key must be the caller's own.
    const inherited = [...known].filter((k) => k in opts && !Object.prototype.hasOwnProperty.call(opts, k));
    if (inherited.length > 0) {
        throw new TypeError(`@orangecheck/relay-filter: ${where}: option ${inherited.join(', ')} is inherited, not set by the caller`);
    }
}

export const checkFilterOptions = (opts: FilterOptions, where = 'filterEvent'): void =>
    refuseUnknown(where, opts, FILTER_OPTIONS);

export const checkIndexOptions = (opts: IndexOptions): void =>
    refuseUnknown('AttestationIndex', opts, INDEX_OPTIONS);
