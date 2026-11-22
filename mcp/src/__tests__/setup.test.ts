import { describe, expect, it } from 'vitest';

import { Docs } from '../docs.js';
import { checkSetup, formatSetup, type Finding } from '../setup.js';
import { FIXTURE_KEY, lookupWith, netError, replay, respond, site } from './replay.js';

const EXAMPLES = 'https://oc-onboarding-examples.vercel.app/';

const byCheck = (fs: Finding[], check: string) => fs.filter((f) => f.check === check);

function deps(overrides = {}, missing: string[] = []) {
    const { fetch, calls } = replay(overrides);
    return { deps: { ...site(fetch, lookupWith(missing)), docs: new Docs({ fetch }) }, calls };
}

describe('checkSetup on a real, working site', () => {
    it('passes what can be seen from outside and hands over the checklist verbatim', async () => {
        const { deps: d } = deps();
        const r = await checkSetup(d, { site: EXAMPLES, projectKey: FIXTURE_KEY });
        expect(r.origin).toBe('https://oc-onboarding-examples.vercel.app');
        const verdicts = Object.fromEntries(r.findings.map((f) => [f.check, f.verdict]));
        expect(verdicts).toEqual({
            HTTPS: 'pass',
            'HTTP redirect': 'pass',
            audience: 'info',
            'Cross-Origin-Opener-Policy': 'pass',
            'Content-Security-Policy': 'info',
            'Domain verification': 'pass',
            'Project domain': 'pass',
            'Project mode': 'info',
            'Who can sign in': 'info',
        });
        expect(byCheck(r.findings, 'Domain verification')[0]!.detail).toBe(
            'me.ochk.io records oc-onboarding-examples.vercel.app as verified for this project.'
        );
        expect(r.byHand).toContain('- [ ] No script ever holds it: not in `localStorage`, not in `sessionStorage`.');
        const text = formatSetup(r);
        expect(text).toContain('Nothing to fix among the checks that can be made from outside.');
        expect(text).toContain('## By hand');
        expect(text).toContain('https://ochk.io/docs/me/quickstart#5--check-it-before-real-people-sign-in');
    });
});

describe('checkSetup on sites that go wrong', () => {
    const doh = (name: string) => `https://cloudflare-dns.com/dns-query?name=${name}&type=TXT`;
    const page = (headers: Record<string, string> = {}) => respond(200, '<html><head></head><body><h1>An app with words on it</h1></body></html>', { 'content-type': 'text/html', ...headers });

    it('fails a page that sends Cross-Origin-Opener-Policy: same-origin', async () => {
        const { deps: d } = deps({
            'https://coop.example/signin': page({ 'cross-origin-opener-policy': 'same-origin' }),
            'https://coop.example/': page(),
            'http://coop.example/signin': respond(301, '', { location: 'https://coop.example/signin' }),
            [doh('coop.example')]: respond(200, '{"Status":0}'),
        });
        const r = await checkSetup(d, { site: 'https://coop.example/signin' });
        const coop = byCheck(r.findings, 'Cross-Origin-Opener-Policy')[0]!;
        expect(coop.verdict).toBe('fail');
        expect(coop.detail).toMatch(/never gets the popup's token back: send same-origin-allow-popups, or no such header/);
        expect(coop.docs).toBe('https://ochk.io/docs/me/quickstart#2--add-the-sign-in-popup');
    });

    it('warns when www and the apex serve the site separately, and names both audiences', async () => {
        const { deps: d } = deps({
            'https://split.example/': page(),
            'https://www.split.example/': page(),
            'http://split.example/': respond(301, '', { location: 'https://split.example/' }),
            [doh('split.example')]: respond(200, '{"Status":0}'),
        });
        const r = await checkSetup(d, { site: 'split.example' });
        const www = byCheck(r.findings, 'www and the apex')[0]!;
        expect(www.verdict).toBe('warn');
        expect(www.detail).toContain("audience: ['https://split.example', 'https://www.split.example']");
    });

    it('passes www redirecting to the apex, and gives the apex as the audience', async () => {
        const { deps: d } = deps({
            'https://one.example/': page(),
            'https://www.one.example/': respond(308, '', { location: 'https://one.example/' }),
            'http://one.example/': respond(308, '', { location: 'https://one.example/' }),
            [doh('one.example')]: respond(200, '{"Status":0}'),
        });
        const r = await checkSetup(d, { site: 'https://one.example' });
        expect(byCheck(r.findings, 'www and the apex')[0]!.verdict).toBe('pass');
        expect(byCheck(r.findings, 'audience')[0]!.detail).toMatch(/^People end up on https:\/\/one\.example\. That exact string is the audience/);
    });

    it('warns when plain HTTP serves the page instead of redirecting', async () => {
        const { deps: d } = deps({
            'https://plain.example/': page(),
            'http://plain.example/': page(),
            [doh('plain.example')]: respond(200, '{"Status":0}'),
        });
        const r = await checkSetup(d, { site: 'plain.example' });
        expect(byCheck(r.findings, 'HTTP redirect')[0]!.verdict).toBe('warn');
    });

    it('fails a certificate that does not verify, and says it is the certificate', async () => {
        const { deps: d } = deps({
            'https://badcert.example/': netError('CERT_HAS_EXPIRED'),
            'http://badcert.example/': respond(301, '', { location: 'https://badcert.example/' }),
            [doh('badcert.example')]: respond(200, '{"Status":0}'),
        });
        const r = await checkSetup(d, { site: 'badcert.example' });
        const https = byCheck(r.findings, 'HTTPS')[0]!;
        expect(https.verdict).toBe('fail');
        expect(https.detail).toMatch(/CERT_HAS_EXPIRED.*Its certificate is not valid\./);
    });

    it('fails a site that is not on the project\'s domain', async () => {
        const { deps: d } = deps({
            'https://preview-123.vercel.app/': page(),
            'http://preview-123.vercel.app/': respond(308, '', { location: 'https://preview-123.vercel.app/' }),
            [doh('preview-123.vercel.app')]: respond(200, '{"Status":0}'),
        }, ['www.preview-123.vercel.app']);
        const r = await checkSetup(d, { site: 'https://preview-123.vercel.app', projectKey: FIXTURE_KEY });
        const pd = byCheck(r.findings, 'Project domain')[0]!;
        expect(pd.verdict).toBe('fail');
        expect(pd.detail).toMatch(/is not oc-onboarding-examples\.vercel\.app or a subdomain of it/);
    });

    it('still gives the checks it could make when the docs are down, and says where the checklist is', async () => {
        const { deps: d } = deps({ 'https://ochk.io/docs/me/quickstart.md': respond(503, 'down') });
        const r = await checkSetup(d, { site: EXAMPLES });
        expect(r.byHand).toBeUndefined();
        expect(formatSetup(r)).toContain('(The checklist could not be read just now: open https://ochk.io/docs/me/quickstart#5--check-it-before-real-people-sign-in.)');
        expect(byCheck(r.findings, 'HTTPS')[0]!.verdict).toBe('pass');
    });
});
