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
        return entry.value;
    }

    set(key: string, value: FilterDecision): void {
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
