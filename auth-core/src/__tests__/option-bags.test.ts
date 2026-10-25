/**
 * Every option check here holds to auth-core/test-vectors/option-bags.json, which
 * every package with an option bag reads: a known option read through the
 * prototype is refused, one the caller set is read.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRevocationCheck, integratorRevocationCheck, nameProblem, signSession, verifyOcToken, verifySessionToken } from '../index';

const { cases } = JSON.parse(
    readFileSync(join(process.cwd(), '..', 'auth-core', 'test-vectors', 'option-bags.json'), 'utf8')
) as {
    cases: Array<{ name: string; own: boolean; prototype_depth: number; on_object_prototype: boolean; refused: boolean }>;
};

interface Bag {
    name: string;
    key: string;
    value: unknown;
    base?: Record<string, unknown>;
    call: (options: never) => unknown;
}

const BAGS: Bag[] = [
    { name: 'verifyOcToken', key: 'audience', value: 'https://site.example', call: (o) => verifyOcToken('not.a.token', o) },
    { name: 'verifySessionToken', key: 'issuer', value: 'https://ochk.io', base: { publicJwk: 'x' }, call: (o) => verifySessionToken('not.a.token', o) },
    { name: 'signSession', key: 'issuer', value: 'https://ochk.io', base: { kid: 'k', privateJwk: 'x' }, call: (o) => signSession({ sub: 'a', did_oc: 'did:oc:x', jti: 'j' }, o, 60) },
    { name: 'integratorRevocationCheck', key: 'projectKey', value: 'pk_live_x', call: (o) => integratorRevocationCheck(o) },
    { name: 'createRevocationCheck', key: 'token', value: 'secret', call: (o) => createRevocationCheck(o) },
    { name: 'nameProblem', key: 'allowReserved', value: true, call: (o) => nameProblem('ochk', 80, o) },
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
                let proto: object = c.prototype_depth > 0 ? { [bag.key]: bag.value } : {};
                for (let i = 1; i < c.prototype_depth; i++) proto = Object.create(proto);
                const options = Object.assign(Object.create(proto), bag.base);
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
