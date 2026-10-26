import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as source from '../index';
import * as integrator from '../integrator';
import type { IntegratorPriceConfig } from '../types';

/**
 * The client validator refuses what me.ochk.io's refuses: a class other than
 * A, B or C, and a custom event key that is not a slug or that names something
 * every object already has. Cases come from test-vectors/integrator-config.json,
 * which me.ochk.io's validator is held to as well. Run against the source and
 * the built package, through the main entry and through /integrator.
 */
const V = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'test-vectors', 'integrator-config.json'), 'utf8')
) as {
    base: Omit<IntegratorPriceConfig, 'events'>;
    event: Record<string, unknown>;
    event_disabled: Record<string, unknown>;
    class: { accept: unknown[]; refuse: unknown[] };
    key: { accept: string[]; refuse: string[] };
    shape: {
        refuse: { name: string; event: unknown; message: string }[];
        accept: { name: string; event: unknown }[];
        events_refuse: unknown[];
    };
};

const DIST = join(__dirname, '..', '..', 'dist', 'index.mjs');
const INTEGRATOR_DIST = join(__dirname, '..', '..', 'dist', 'integrator.mjs');

function config(key: string, event: Record<string, unknown>): IntegratorPriceConfig {
    // fromEntries makes "__proto__" an own key, as JSON.parse does on the server.
    return { ...V.base, events: Object.fromEntries([[key, event]]) } as IntegratorPriceConfig;
}

type Mod = Pick<
    typeof source,
    'validateIntegratorConfig' | 'isEventClass' | 'isInheritedName' | 'CUSTOM_EVENT_KEY_RE'
>;

const builds: Array<[string, () => Promise<Mod>]> = [
    ['source', async () => source],
    ['build', async () => (await import(DIST)) as Mod],
    ['source /integrator', async () => integrator],
    ['build /integrator', async () => (await import(INTEGRATOR_DIST)) as Mod],
];

it('the built package exists to be tested', () => {
    expect(existsSync(DIST)).toBe(true);
    expect(existsSync(INTEGRATOR_DIST)).toBe(true);
});

describe.each(builds)('integrator config vectors (%s)', (_name, load) => {
    it('takes an event with each accepted class, and with none', async () => {
        const m = await load();
        for (const cls of V.class.accept) {
            const r = m.validateIntegratorConfig(config('note', { ...V.event, class: cls }));
            expect(r, `class ${JSON.stringify(cls)}`).toEqual({ ok: true, errors: [] });
        }
        expect(m.validateIntegratorConfig(config('note', V.event))).toEqual({ ok: true, errors: [] });
    });

    it.each(V.class.refuse.map((c) => [JSON.stringify(c), c]))(
        'refuses class %s',
        async (_label, cls) => {
            const m = await load();
            for (const event of [V.event, V.event_disabled]) {
                const r = m.validateIntegratorConfig(config('note', { ...event, class: cls }));
                expect(r.ok).toBe(false);
                expect(r.errors).toEqual([
                    { subtype: 'note', message: `class must be A, B or C (got ${JSON.stringify(cls)})` },
                ]);
            }
            expect(m.isEventClass(cls)).toBe(false);
        }
    );

    it('takes each accepted key', async () => {
        const m = await load();
        for (const key of V.key.accept) {
            const r = m.validateIntegratorConfig(config(key, V.event));
            expect(r, `key ${key}`).toEqual({ ok: true, errors: [] });
        }
    });

    it.each(V.key.refuse.map((k) => [JSON.stringify(k), k]))('refuses key %s', async (_label, key) => {
        const m = await load();
        const shape = m.CUSTOM_EVENT_KEY_RE.test(key);
        for (const event of [V.event, V.event_disabled]) {
            const r = m.validateIntegratorConfig(config(key, event));
            expect(r.ok).toBe(false);
            expect(r.errors).toHaveLength(1);
            expect(r.errors[0]?.subtype).toBe(key);
            expect(r.errors[0]?.message).toMatch(
                shape ? /is a name every object already has/ : /must match/
            );
        }
        if (shape) expect(m.isInheritedName(key)).toBe(true);
    });

    it('names the inherited keys in any case, and no slug of its own', async () => {
        const m = await load();
        for (const key of ['constructor', 'ToString', '__proto__', 'HASOWNPROPERTY']) {
            expect(m.isInheritedName(key), key).toBe(true);
        }
        for (const key of V.key.accept) expect(m.isInheritedName(key), key).toBe(false);
    });
});

describe.each(builds)('integrator config shape vectors (%s)', (_name, load) => {
    const raw = (events: unknown) => ({ ...V.base, events }) as unknown as IntegratorPriceConfig;

    it.each(V.shape.refuse.map((c) => [c.name, c] as const))('refuses %s, naming the field', async (_n, c) => {
        const m = await load();
        expect(m.validateIntegratorConfig(raw(Object.fromEntries([['note', c.event]])))).toEqual({
            ok: false,
            errors: [{ subtype: 'note', message: c.message }],
        });
    });

    it.each(V.shape.accept.map((c) => [c.name, c] as const))('takes %s', async (_n, c) => {
        const m = await load();
        expect(m.validateIntegratorConfig(raw(Object.fromEntries([['note', c.event]])))).toEqual({
            ok: true,
            errors: [],
        });
    });

    it('refuses events that are not an object', async () => {
        const m = await load();
        for (const events of V.shape.events_refuse) {
            expect(m.validateIntegratorConfig(raw(events)).errors, JSON.stringify(events)).toEqual([
                { message: 'events must be an object' },
            ]);
        }
    });
});
