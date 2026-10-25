/**
 * OC Connect from a site's own backend. The answers come from
 * test-vectors/connect.json, which sdk-py reads too (tests/test_connect.py), so
 * a Node site and a Python site get the same result from the same answer.
 *
 * A refusal or an outage is a result, never a throw: a failed call must not
 * block the site's own login. Only a mistake in the call itself throws.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as words from '../connect-consent';
import { connectClaimLink, connectDelete, connectProvision } from '../server';
import * as browser from '../index';

type Call = 'provision' | 'delete' | 'claim_link';
const V = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'test-vectors', 'connect.json'), 'utf8')
) as {
    consent: { label: string; blurb: string };
    user_ids: { accepted: string[]; refused: string[] };
    requests: {
        name: string;
        call: Call;
        input: Record<string, unknown>;
        path: string;
        body: Record<string, unknown>;
    }[];
    answers: {
        name: string;
        call: Call;
        status: number;
        body?: unknown;
        raw?: string;
        headers?: Record<string, string>;
        result: Record<string, unknown>;
    }[];
};

const KEY = 'ck_live_test_key';
const sent: { url: string; init: RequestInit }[] = [];

function answer(status: number, body: unknown, raw?: string, headers?: Record<string, string>) {
    sent.length = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            sent.push({ url, init });
            // As fetch does: with redirect 'error', a redirect is a network error.
            if (init.redirect === 'error' && status >= 300 && status < 400) {
                throw new TypeError('fetch failed: unexpected redirect');
            }
            return new Response(raw ?? JSON.stringify(body), {
                status,
                headers: {
                    'content-type': raw !== undefined ? 'text/html' : 'application/json',
                    ...headers,
                },
            });
        })
    );
}

/** The vectors' snake_case input, as each call's options. */
function call(name: Call, input: Record<string, unknown>) {
    const opts = {
        apiKey: KEY,
        userId: input.user_id as string,
        ...(input.consent !== undefined ? { consent: input.consent as true } : {}),
        ...(input.email !== undefined ? { email: input.email as string } : {}),
        ...(input.email_verified !== undefined
            ? { emailVerified: input.email_verified as boolean }
            : {}),
    };
    if (name === 'provision') return connectProvision(opts);
    if (name === 'delete') return connectDelete(opts);
    return connectClaimLink(opts);
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('what each call sends', () => {
    for (const r of V.requests) {
        it(r.name, async () => {
            answer(500, { ok: false, reason: 'server_error' });
            await call(r.call, r.input);
            expect(sent).toHaveLength(1);
            expect(sent[0]!.url).toBe(`https://ochk.io${r.path}`);
            expect(sent[0]!.init.method).toBe('POST');
            // A redirect is an error: the key and the body go to ochk.io only.
            expect(sent[0]!.init.redirect).toBe('error');
            const headers = new Headers(sent[0]!.init.headers);
            expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
            expect(headers.get('content-type')).toBe('application/json');
            expect(JSON.parse(String(sent[0]!.init.body))).toEqual(r.body);
        });
    }
});

describe('what each answer becomes', () => {
    for (const a of V.answers) {
        it(a.name, async () => {
            answer(a.status, a.body, a.raw, a.headers);
            expect(await call(a.call, { user_id: 'user-1' })).toEqual(a.result);
        });
    }
});

describe('user ids are counted as ochk.io counts them, in UTF-16 code units', () => {
    for (const id of V.user_ids.accepted) {
        it(`accepts ${id.length} units`, async () => {
            answer(500, { ok: false, reason: 'server_error' });
            await connectProvision({ apiKey: KEY, userId: id });
            expect(sent).toHaveLength(1);
        });
    }
    for (const id of V.user_ids.refused) {
        it(`refuses ${id.length} units`, () => {
            answer(500, {});
            expect(() => connectProvision({ apiKey: KEY, userId: id })).toThrow(/userId/);
            expect(sent).toHaveLength(0);
        });
    }
});

// An inherited key was invisible to the unknown-option check but read later, so
// a polluted Object.prototype could choose where the API key goes and tick consent.
describe('only the caller\'s own options are read', () => {
    afterEach(() => {
        delete (Object.prototype as Record<string, unknown>).origin;
        delete (Object.prototype as Record<string, unknown>).consent;
    });

    it('a polluted Object.prototype.origin does not move the call', async () => {
        (Object.prototype as Record<string, unknown>).origin = 'https://evil.example';
        answer(500, { ok: false, reason: 'server_error' });
        await connectProvision({ apiKey: KEY, userId: 'u' });
        expect(sent[0]!.url).toBe('https://ochk.io/api/connect/provision');
    });

    it('a polluted Object.prototype.consent is refused, never sent as the box ticked', async () => {
        (Object.prototype as Record<string, unknown>).consent = true;
        answer(500, { ok: false, reason: 'server_error' });
        expect(() => connectProvision({ apiKey: KEY, userId: 'u' })).toThrow(/option consent is inherited/);
        expect(sent).toHaveLength(0);
    });

    it('options built on a prototype that carries origin and consent', async () => {
        const options = Object.assign(
            Object.create({ origin: 'https://evil.example', consent: true }) as object,
            { apiKey: KEY, userId: 'u' }
        ) as { apiKey: string; userId: string };
        answer(500, { ok: false, reason: 'server_error' });
        expect(() => connectProvision(options)).toThrow(/option consent is inherited/);
        expect(sent).toHaveLength(0);
    });

    it('a getter is read once, so the check and the body see the same value', async () => {
        let reads = 0;
        const options = {
            apiKey: KEY,
            get userId() {
                reads++;
                return reads === 1 ? 'checked' : 'x'.repeat(1000);
            },
        };
        answer(500, { ok: false, reason: 'server_error' });
        await connectProvision(options);
        expect(reads).toBe(1);
        expect(JSON.parse(String(sent[0]!.init.body))).toEqual({ user_id: 'checked' });
    });
});

describe('a claim link goes to ochk.app', () => {
    it('a link anywhere else is refused', async () => {
        answer(200, { ok: true, url: 'https://ochk.app.evil.example/connect/claim#t=a', expires_at: 'x' });
        expect(await connectClaimLink({ apiKey: KEY, userId: 'u' })).toEqual({
            ok: false,
            reason: 'unavailable',
            status: 200,
        });
    });
});

describe('an outage is a result, never a throw', () => {
    it('a network failure is unavailable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new TypeError('fetch failed');
            })
        );
        expect(await connectProvision({ apiKey: KEY, userId: 'u' })).toEqual({
            ok: false,
            reason: 'unavailable',
            status: 0,
        });
    });

    it('a call that never answers is unavailable after the timeout', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: string, init: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init.signal?.addEventListener('abort', () =>
                            reject(new DOMException('aborted', 'AbortError'))
                        );
                    })
            )
        );
        const started = Date.now();
        const result = await connectProvision({ apiKey: KEY, userId: 'u', timeoutMs: 50 });
        expect(result).toEqual({ ok: false, reason: 'unavailable', status: 0 });
        expect(Date.now() - started).toBeLessThan(2000);
    });

    it('the timeout is bounded', () => {
        expect(() => connectProvision({ apiKey: KEY, userId: 'u', timeoutMs: 0 })).toThrow(
            /timeoutMs/
        );
        expect(() => connectProvision({ apiKey: KEY, userId: 'u', timeoutMs: 60_000 })).toThrow(
            /timeoutMs/
        );
    });
});

describe('a mistake in the call throws before anything is sent', () => {
    it('an option it does not read', () => {
        answer(200, {});
        const misspelt = { apiKey: KEY, userId: 'u', concent: true } as never;
        expect(() => connectProvision(misspelt)).toThrow(TypeError);
        expect(() => connectProvision(misspelt)).toThrow(/unknown option concent/);
        expect(() => connectDelete({ apiKey: KEY, userId: 'u', consent: true } as never)).toThrow(
            /unknown option consent/
        );
        expect(() =>
            connectClaimLink({ apiKey: KEY, userId: 'u', email: 'a@b.example' } as never)
        ).toThrow(/unknown option email/);
        expect(sent).toHaveLength(0);
    });

    it('consent: false, which would make the account an unticked box declined', () => {
        answer(200, {});
        expect(() => connectProvision({ apiKey: KEY, userId: 'u', consent: false } as never)).toThrow(
            /consent/
        );
        expect(sent).toHaveLength(0);
    });

    it('no key', () => {
        answer(200, {});
        expect(() => connectProvision({ apiKey: '', userId: 'u' })).toThrow(/apiKey/);
        expect(sent).toHaveLength(0);
    });

    it('emailVerified without the email it describes', () => {
        answer(200, {});
        expect(() =>
            connectProvision({ apiKey: KEY, userId: 'u', emailVerified: true })
        ).toThrow(/email/);
    });

    it('in a browser, where the API key would be exposed', () => {
        answer(200, {});
        vi.stubGlobal('document', {});
        expect(() => connectProvision({ apiKey: KEY, userId: 'u' })).toThrow(/server/);
        expect(sent).toHaveLength(0);
    });

    it('an origin: a call carrying the key goes to ochk.io and nowhere else', () => {
        answer(200, {});
        expect(() =>
            connectProvision({ apiKey: KEY, userId: 'u', origin: 'https://evil.example' } as never)
        ).toThrow(/unknown option origin/);
        expect(sent).toHaveLength(0);
    });
});

describe('the consent words', () => {
    it('are the ones in the vectors, so both SDKs show the same box', () => {
        expect(words.CONNECT_CONSENT_LABEL).toBe(V.consent.label);
        expect(words.CONNECT_CONSENT_BLURB).toBe(V.consent.blurb);
    });

    it('are exported from the browser entry too, for a React or plain-JS form', () => {
        expect(browser.CONNECT_CONSENT_LABEL).toBe(V.consent.label);
        expect(browser.CONNECT_CONSENT_BLURB).toBe(V.consent.blurb);
    });

    it('say nothing about earnings, sats or payouts', () => {
        const text = `${words.CONNECT_CONSENT_LABEL} ${words.CONNECT_CONSENT_BLURB}`;
        expect(text).not.toMatch(/earn|sats|bitcoin|pay|money|reward/i);
    });

    it('come from a module with no imports, safe in any bundle', () => {
        const src = readFileSync(join(__dirname, '..', 'connect-consent.ts'), 'utf8');
        expect(src).not.toMatch(/^\s*import\s/m);
        expect(src).not.toMatch(/require\(/);
    });
});
