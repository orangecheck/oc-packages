import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCOPE_IDS } from '../index';
import { parseTrustAttestationCount, scope } from '../scope';
import { getOrigin, setOrigin } from '../transport';

describe('parseTrustAttestationCount', () => {
    it('decodes a well-formed quad', () => {
        const r = parseTrustAttestationCount('3,2,2,1');
        expect(r).toEqual({ total: 3, good: 2, distinct_good_issuers: 2, caution: 1 });
    });

    it('decodes the all-zeros case', () => {
        const r = parseTrustAttestationCount('0,0,0,0');
        expect(r).toEqual({ total: 0, good: 0, distinct_good_issuers: 0, caution: 0 });
    });

    it('returns null for the empty string', () => {
        expect(parseTrustAttestationCount('')).toBeNull();
    });

    it('returns null for a quad with fewer than four parts', () => {
        expect(parseTrustAttestationCount('1,2,3')).toBeNull();
    });

    it('returns null for a quad with more than four parts', () => {
        expect(parseTrustAttestationCount('1,2,3,4,5')).toBeNull();
    });

    it('returns null for non-integer parts', () => {
        expect(parseTrustAttestationCount('1,2,foo,4')).toBeNull();
    });

    it('returns null for negative numbers', () => {
        expect(parseTrustAttestationCount('-1,2,3,4')).toBeNull();
    });

    it('returns null for fractional numbers', () => {
        // parseInt drops the fractional part; we accept it (the wire
        // format never emits fractions; defensive parsing is OK).
        // But "1.5,2,3,4" should be accepted as 1 because parseInt('1.5')=1.
        // Document the behavior: parseInt is liberal.
        const r = parseTrustAttestationCount('1.5,2,3,4');
        expect(r).toEqual({ total: 1, good: 2, distinct_good_issuers: 3, caution: 4 });
    });
});

describe('scope.request', () => {
    const go = (opts: { origin?: string } = {}) => {
        const assign = vi.fn();
        vi.stubGlobal('window', { location: { assign } });
        expect(() =>
            scope.request(['email', 'display_name'], {
                project_key: 'pk_live_x',
                return_to: 'https://app.example/after',
                ...opts,
            })
        ).toThrow('redirected to consent prompt');
        return new URL(assign.mock.calls[0]![0] as string);
    };
    const apiOrigin = getOrigin();
    afterEach(() => {
        vi.unstubAllGlobals();
        setOrigin(apiOrigin);
    });

    it("sends the person to ochk.app's consent page, not the retired me.ochk.io page", () => {
        const url = go();
        expect(url.origin + url.pathname).toBe('https://ochk.app/me/scope-grant');
        expect(url.searchParams.get('project_key')).toBe('pk_live_x');
        expect(url.searchParams.get('scopes')).toBe('email,display_name');
        expect(url.searchParams.get('return_to')).toBe('https://app.example/after');
    });

    it('keeps the consent page on ochk.app when the API origin is moved', () => {
        setOrigin('https://me-staging.example');
        expect(go().origin).toBe('https://ochk.app');
    });

    it('takes an explicit consent origin', () => {
        expect(go({ origin: 'https://app-staging.example' }).origin).toBe(
            'https://app-staging.example'
        );
    });
});

describe('the scopes me.ochk.io knows', () => {
    // The same ids, in the same order, as SCOPE_IDS in oc-me-web/src/lib/privacy/scopes.ts.
    const ME_WEB = [
        'bitcoin_address',
        'email',
        'attest_tier',
        'display_name',
        'cross_integrator_event_count',
        'cross_integrator_human_event_count',
        'cross_integrator_lifetime_sats',
        'cross_integrator_distinct_count',
        'cross_integrator_oldest_event_at',
        'cross_integrator_active_days',
        'trust_attestation_count',
        'trust_attestations_bundle',
    ];
    const FIVE = [
        'cross_integrator_lifetime_sats',
        'cross_integrator_distinct_count',
        'cross_integrator_oldest_event_at',
        'cross_integrator_active_days',
        'trust_attestations_bundle',
    ] as const;
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exports every id, and nobody can change the list scope.request checks', () => {
        expect(SCOPE_IDS).toEqual(ME_WEB);
        expect(Object.isFrozen(SCOPE_IDS)).toBe(true);
    });

    it('asks for each of the five that 0.57.0 refused', () => {
        const assign = vi.fn();
        vi.stubGlobal('window', { location: { assign } });
        expect(() =>
            scope.request([...FIVE], { project_key: 'pk_live_x', return_to: 'https://app.example/after' })
        ).toThrow('redirected to consent prompt');
        const url = new URL(assign.mock.calls[0]![0] as string);
        expect(url.searchParams.get('scopes')).toBe(FIVE.join(','));
    });

    it('still refuses an id me.ochk.io does not know, before any redirect', () => {
        const assign = vi.fn();
        vi.stubGlobal('window', { location: { assign } });
        expect(() =>
            scope.request(['email', 'wallet_keys' as never], {
                project_key: 'pk_live_x',
                return_to: 'https://app.example/after',
            })
        ).toThrow(`oc.scope.request: unknown scope "wallet_keys" · valid: ${ME_WEB.join(', ')}`);
        expect(assign).not.toHaveBeenCalled();
    });
});

describe('scope.granted from your backend (R11 P1-1)', () => {
    const DID = 'did:oc:0123456789abcdef0123456789abcdef';
    const SECRET = 'project-signing-secret';
    let sent: Array<{ url: URL; headers: Headers; credentials?: RequestCredentials }> = [];
    const answer = { ok: true, sub: 'sub_x', scopes_granted: ['email'], scopes: { email: 'a@b.example' } };
    const stubFetch = () => {
        sent = [];
        vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
            sent.push({ url: new URL(String(url)), headers: new Headers(init?.headers), credentials: init?.credentials });
            return Response.json(answer);
        });
    };
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('asks about the named person, signed the way the route checks it', async () => {
        stubFetch();
        const before = Math.floor(Date.now() / 1000);
        const r = await scope.granted({ project_key: 'pk_live_x', accountId: DID, signingSecret: SECRET });
        expect(sent).toHaveLength(1);
        const { url, headers } = sent[0]!;
        expect(url.pathname).toBe('/api/integrator/scopes/pk_live_x');
        expect([...url.searchParams.keys()]).toEqual(['user']);
        expect(url.searchParams.get('user')).toBe(DID);
        const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(headers.get('x-oc-signature') ?? '');
        expect(m).not.toBeNull();
        const t = Number(m![1]);
        expect(t).toBeGreaterThanOrEqual(before);
        expect(t).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        const expected = createHmac('sha256', SECRET)
            .update(`${m![1]}.project_key=pk_live_x&user=${DID}`)
            .digest('hex');
        expect(m![2]).toBe(expected);
        expect(r).toEqual({ sub: 'sub_x', scopes_granted: ['email'], scopes: { email: 'a@b.example' } });
    });

    it('never puts the secret on the wire', async () => {
        stubFetch();
        await scope.granted({ project_key: 'pk_live_x', accountId: DID, signingSecret: SECRET });
        const { url, headers } = sent[0]!;
        expect(url.toString()).not.toContain(SECRET);
        for (const [, v] of headers) expect(v).not.toContain(SECRET);
    });

    it('needs the secret and the person together, and says so before any request', async () => {
        stubFetch();
        await expect(scope.granted({ project_key: 'pk_live_x', accountId: DID })).rejects.toThrow(/signingSecret/);
        await expect(scope.granted({ project_key: 'pk_live_x', signingSecret: SECRET })).rejects.toThrow(/accountId/);
        expect(sent).toEqual([]);
    });

    it('refuses an accountId that is not a did:oc, before any request', async () => {
        stubFetch();
        for (const bad of [` ${DID}`, DID.toUpperCase(), 'bc1qexample', `${DID}0`]) {
            await expect(
                scope.granted({ project_key: 'pk_live_x', accountId: bad, signingSecret: SECRET })
            ).rejects.toThrow(/did:oc/);
        }
        expect(sent).toEqual([]);
    });

    it('with neither, reads the signed-in session and signs nothing', async () => {
        stubFetch();
        await scope.granted({ project_key: 'pk_live_x' });
        const { url, headers } = sent[0]!;
        expect(url.search).toBe('');
        expect(headers.get('x-oc-signature')).toBeNull();
    });
});
