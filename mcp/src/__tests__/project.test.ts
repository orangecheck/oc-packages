import { describe, expect, it } from 'vitest';

import { formatProject, readProject } from '../project.js';
import { FIXTURE_KEY, netError, replay, respond, UNKNOWN_KEY } from './replay.js';

describe('readProject', () => {
    it('reads all four public endpoints of a real project', async () => {
        const r = await readProject(replay().fetch, FIXTURE_KEY);
        expect(r.unknown).toBe(false);
        expect(r.mode).toBe('test');
        expect(r.identity.data).toEqual({
            display_name: 'oc-onboarding-examples live smoke',
            domain: 'oc-onboarding-examples.vercel.app',
            verified: true,
            frozen: false,
            moved_from: null,
        });
        expect(r.signIn.data).toEqual({ require_bond: null });
        expect(r.native.data).toEqual({ enabled: false, name: 'oc-onboarding-examples live smoke', audiences: [] });
        expect(Object.keys(r.config.data!.config.events!)).toEqual(['account_creation', 'session_creation', 'payment_authorization']);

        const text = formatProject(r);
        expect(text).toContain('- Domain: oc-onboarding-examples.vercel.app');
        expect(text).toContain('- Domain verified: yes');
        expect(text).toContain('Everyone: every orangecheck account (the default).');
        expect(text).toContain('  - account_creation: on: site pays 1000 sats, user earns 80% of it');
        expect(text).toContain('  - payment_authorization: on: site pays 0.5% of the payment, user earns 80% of it');
        expect(text).toContain(`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/sign-in`);
    });

    it('says plainly when no project has the key', async () => {
        const r = await readProject(replay().fetch, UNKNOWN_KEY);
        expect(r.unknown).toBe(true);
        expect(formatProject(r)).toMatch(/^No project has the key pk_test_doesnotexist000: me\.ochk\.io answered 404 project_not_found\./);
    });

    it('refuses something that is not a project key before asking anyone', async () => {
        const { fetch, calls } = replay();
        await expect(readProject(fetch, 'sk_live_abc')).rejects.toThrow(/is not a project key\. A key starts pk_test_ or pk_live_/);
        await expect(readProject(fetch, 'pk_test_../../admin')).rejects.toThrow(/is not a project key/);
        expect(calls).toEqual([]);
    });

    it('keeps the parts it could read when one endpoint fails, and names the one that did', async () => {
        const { fetch } = replay({
            [`https://me.ochk.io/api/integrator/config?project_key=${FIXTURE_KEY}`]: respond(500, '{"ok":false,"reason":"internal"}'),
            [`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/native`]: netError('ECONNRESET'),
        });
        const r = await readProject(fetch, FIXTURE_KEY);
        expect(r.identity.ok).toBe(true);
        const text = formatProject(r);
        expect(text).toContain(`- Not read: https://me.ochk.io/api/integrator/config?project_key=${FIXTURE_KEY} answered 500 internal.`);
        expect(text).toContain(`- Not read: https://me.ochk.io/api/integrator/${FIXTURE_KEY}/native could not be reached (ECONNRESET).`);
        expect(text).toContain('- Domain: oc-onboarding-examples.vercel.app');
    });

    it('describes a bitcoin floor', async () => {
        const { fetch } = replay({
            [`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/sign-in`]: respond(200, '{"ok":true,"require_bond":{"min_sats":100000,"min_days":30}}'),
        });
        const text = formatProject(await readProject(fetch, FIXTURE_KEY));
        expect(text).toContain('Backed by bitcoin: accounts backed by one coin of at least 100,000 sats, held at least 30 days.');
    });
});
