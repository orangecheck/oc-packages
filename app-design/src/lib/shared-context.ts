import { createContext, type Context } from 'react';

/**
 * A context that is the same object in every entry. Each entry (./chrome,
 * ./components, ./primitives) is bundled on its own, so a plain
 * createContext in a shared module makes one context per entry, and a
 * provider from one entry is invisible to a reader from another. Keyed on
 * globalThis by name, there is one.
 */
export function sharedContext<T>(name: string, initial: T): Context<T> {
    const key = Symbol.for(`@orangecheck/app-design/${name}`);
    const store = globalThis as unknown as Record<symbol, Context<T> | undefined>;
    return (store[key] ??= createContext<T>(initial));
}
