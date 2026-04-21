import type { GateDecision } from './types';

interface Entry {
    value: GateDecision;
    expires: number;
}

/**
 * Tiny LRU + TTL cache. No deps. Good enough for per-process gate state.
 *
 * Eviction: oldest-inserted key first once max is reached. Ties to real LRU
 * (touching on read) would be a nice-to-have; in practice gate callers hit
 * the same subject repeatedly inside the TTL window so insertion-order is
 * equivalent.
 */
export class TtlLru {
    private readonly store = new Map<string, Entry>();

    constructor(
        private readonly max: number,
        private readonly ttlMs: number
    ) {}

    get(key: string): GateDecision | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    set(key: string, value: GateDecision): void {
        if (this.store.size >= this.max) {
            const first = this.store.keys().next().value;
            if (first !== undefined) this.store.delete(first);
        }
        this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    }

    clear(): void {
        this.store.clear();
    }
}
