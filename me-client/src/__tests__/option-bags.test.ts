// @vitest-environment node
/**
 * Every option check here holds to auth-core/test-vectors/option-bags.json, which
 * every package with an option bag reads: a known option read through the
 * prototype is refused, one the caller set is read.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectProvision } from '../connect';
import { exchangeNativeCode } from '../native';
import { checkOcSession, checkOcToken, checkSignInRule, verifyOcToken, withOcAuth } from '../server';
import { revokeToken } from '../tokens';
import { checkSignInOptions } from '../button';

const noToken = { cookie: null, authorization: null };
const nativeInput = { code: 'c', codeVerifier: 'v', redirectUri: 'app://cb', audience: 'https://site.example' };

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
    { name: 'verifyOcToken', key: 'audience', value: 'https://site.example', call: (o) => verifyOcToken('not.a.token', o) },
    { name: 'checkOcToken', key: 'requireHandle', value: false, call: (o) => checkOcToken('not.a.token', o) },
    { name: 'checkOcSession', key: 'audience', value: 'https://site.example', call: (o) => checkOcSession(noToken, o) },
    { name: 'withOcAuth', key: 'projectKey', value: 'pk_test_x', call: (o) => withOcAuth(() => undefined, o) },
    { name: 'withOcAuth requireBond', key: 'minSats', value: 1000, call: (o) => withOcAuth(() => undefined, { requireBond: o }) },
    { name: 'checkSignInRule', key: 'projectKey', value: 'pk_test_x', call: (o) => checkSignInRule({} as never, o) },
    { name: 'revokeToken', key: 'timeoutMs', value: 1000, call: (o) => revokeToken('t', o) },
    { name: 'connectProvision', key: 'apiKey', value: 'oc_connect_x', base: { userId: 'u1' }, call: (o) => connectProvision(o) },
    { name: 'exchangeNativeCode input', key: 'code', value: 'c', base: { codeVerifier: 'v', redirectUri: 'app://cb', audience: 'https://site.example' }, call: (o) => exchangeNativeCode(o, { projectKey: 'pk_test_x' }) },
    { name: 'exchangeNativeCode options', key: 'projectKey', value: 'pk_test_x', call: (o) => exchangeNativeCode(nativeInput, o) },
    { name: 'checkSignInOptions', key: 'label', value: 'Sign in with orangecheck', base: { onSignedIn: () => undefined }, call: (o) => checkSignInOptions(o) },
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
