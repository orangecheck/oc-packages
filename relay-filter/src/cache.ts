import type { FilterDecision } from './types';

interface Entry {
    value: FilterDecision;
    expires: number;
}

export class TtlLru {
    private readonly store = new Map<string, Entry>();

    constructor(
        private readonly max: number,
        private readonly ttlMs: number
    ) {}

    get(key: string): FilterDecision | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) {
            this.store.delete(key);
            return undefined;
        }
        // Touch on access so hot entries survive insertion pressure. Without
        // this, the old implementation was FIFO-with-TTL, not actually LRU —
        // a frequently-hit key could be evicted by N cold writes before it
        // ever moved in the map's insertion order.
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }

    /** Optional per-call TTL override. Used by the filter to cache
     * lookup-error decisions with a short TTL (circuit-breaker pattern). */
    set(key: string, value: FilterDecision, ttlMs?: number): void {
        if (this.store.size >= this.max) {
            const first = this.store.keys().next().value;
            if (first !== undefined) this.store.delete(first);
        }
        this.store.set(key, { value, expires: Date.now() + (ttlMs ?? this.ttlMs) });
    }

    clear(): void {
        this.store.clear();
    }
}
