/**
 * Every option check here holds to auth-core/test-vectors/option-bags.json, which
 * every package with an option bag reads: a known option read through the
 * prototype is refused, one the caller set is read.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { check } from '../check';

const { cases } = JSON.parse(
    readFileSync(join(process.cwd(), '..', 'auth-core', 'test-vectors', 'option-bags.json'), 'utf8')
) as {
    cases: Array<{ name: string; own: boolean; on_prototype: boolean; on_object_prototype: boolean; refused: boolean }>;
};

interface Bag {
    name: string;
    key: string;
    value: unknown;
    base?: Record<string, unknown>;
    call: (options: never) => unknown;
}

const BAGS: Bag[] = [
    { name: 'check()', key: 'minSats', value: 100_000, base: { addr: 'bc1qexample' }, call: (o) => check(o) },
    { name: 'check() verifyOptions', key: 'expectedAud', value: 'https://site.example', call: (o) => check({ addr: 'bc1qexample', verifyOptions: o }) },
];

async function messageOf(call: () => unknown): Promise<string | null> {
    try {
        await call();
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

describe('an option bag reads only the keys its caller set', () => {
    afterEach(() => vi.unstubAllGlobals());
    for (const bag of BAGS) {
        for (const c of cases) {
            it(`${bag.name}: ${bag.key} ${c.name}`, async () => {
                vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
                const options = Object.assign(Object.create(c.on_prototype ? { [bag.key]: bag.value } : {}), bag.base);
                if (c.own) options[bag.key] = bag.value;
                const shared = Object.prototype as Record<string, unknown>;
                if (c.on_object_prototype) shared[bag.key] = bag.value;
                let message: string | null;
                try {
                    message = await messageOf(() => bag.call(options as never));
                } finally {
                    if (c.on_object_prototype) delete shared[bag.key];
                }
                if (c.refused) expect(message).toMatch(/is inherited, not set by the caller/);
                else expect(message ?? '').not.toMatch(/inherited/);
            });
        }
    }
});
