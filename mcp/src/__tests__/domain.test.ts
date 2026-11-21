import { describe, expect, it } from 'vitest';

import { checkDomain, formatDomainCheck, isPrivateAddress, normalizeDomain, sameSite } from '../domain.js';
import { EXAMPLES_TOKEN, lookupWith, OCHK_TXT_TOKEN, replay, respond } from './replay.js';

const EXAMPLES = 'oc-onboarding-examples.vercel.app';
const OCHK_HOME = respond(200, '<!doctype html><html><head><title>orangecheck</title></head><body><h1>orangecheck</h1></body></html>', {
    'content-type': 'text/html',
});

describe('normalizeDomain', () => {
    it('takes a URL or a bare name', () => {
        expect(normalizeDomain('https://Lumen.example/app')).toBe('lumen.example');
        expect(normalizeDomain(' yourapp.example. ')).toBe('yourapp.example');
    });
    it.each(['localhost', '10.0.0.1', '[::1]', 'http://127.0.0.1:3000', 'not a domain', '-bad.example'])('refuses %s', (d) => {
        expect(() => normalizeDomain(d)).toThrow();
    });
});

describe('addresses and redirects', () => {
    it('treats private, loopback and link-local addresses as private', () => {
        for (const a of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
            expect(isPrivateAddress(a), a).toBe(true);
        }
        for (const a of ['93.184.216.34', '1.1.1.1', '2606:4700::1111']) expect(isPrivateAddress(a), a).toBe(false);
    });
    it('follows the domain and its www twin only', () => {
        expect(sameSite('www.yourapp.example', 'yourapp.example')).toBe(true);
        expect(sameSite('yourapp.example', 'www.yourapp.example')).toBe(true);
        expect(sameSite('evil.example', 'yourapp.example')).toBe(false);
        expect(sameSite('app.yourapp.example', 'yourapp.example')).toBe(false);
    });
});

describe('checkDomain, on recorded answers', () => {
    it('finds the meta tag a real site serves, and its token', async () => {
        const c = await checkDomain({ fetch: replay().fetch, lookup: lookupWith() }, `https://${EXAMPLES}/`, EXAMPLES_TOKEN);
        expect(c.verified).toBe(true);
        expect(c.via).toBe('meta-tag');
        expect(c.meta.contents).toEqual([EXAMPLES_TOKEN]);
        expect(c.dns.records).toEqual([]);
        expect(formatDomainCheck(c)).toMatch(/^# Domain verification: oc-onboarding-examples\.vercel\.app\n\nFound the token through the meta tag\./);
    });

    it('finds a real TXT record, with "oc-verify=" pasted along with the token', async () => {
        const { fetch } = replay({ 'https://ochk.io/': OCHK_HOME });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, 'ochk.io', `oc-verify=${OCHK_TXT_TOKEN}`);
        expect(c.verified).toBe(true);
        expect(c.via).toBe('dns-txt');
        expect(c.dns.ocVerify).toEqual([`oc-verify=${OCHK_TXT_TOKEN}`]);
    });

    it('lists what is published when no token is given', async () => {
        const c = await checkDomain({ fetch: replay().fetch, lookup: lookupWith() }, EXAMPLES);
        expect(c.verified).toBeUndefined();
        expect(formatDomainCheck(c)).toContain(`- oc-domain-verify tags: ${EXAMPLES_TOKEN}`);
        expect(formatDomainCheck(c)).toContain('No token was given');
    });

    it('says a pasted token does not match, on both channels', async () => {
        const { fetch } = replay({ 'https://ochk.io/': OCHK_HOME });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, 'ochk.io', 'a'.repeat(48));
        expect(c.verified).toBe(false);
        expect(c.dns.hint).toMatch(/has 1 oc-verify record, but none match the token given/);
        expect(c.meta.hint).toMatch(/has no <meta name="oc-domain-verify"/);
        expect(formatDomainCheck(c)).toContain('The token was not found on either channel.');
    });
});

describe('checkDomain, when things go wrong', () => {
    it('never reads a host that resolves to a private address', async () => {
        const { fetch, calls } = replay();
        const c = await checkDomain({ fetch, lookup: lookupWith([], { 'intranet.example': '10.0.0.5' }) }, 'intranet.example', 'x'.repeat(48));
        expect(calls.some((u) => u.startsWith('https://intranet.example'))).toBe(false);
        expect(c.meta.error).toMatch(/resolves to 10\.0\.0\.5, a private or local address/);
    });

    it('does not follow a redirect to another site, and says so', async () => {
        const { fetch, calls } = replay({
            'https://cloudflare-dns.com/dns-query?name=moved.example&type=TXT': respond(200, '{"Status":0}'),
            'https://moved.example/': respond(302, '', { location: 'https://elsewhere.example/landing' }),
        });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, 'moved.example', 'x'.repeat(48));
        expect(calls).not.toContain('https://elsewhere.example/landing');
        expect(c.meta.hint).toBe('https://moved.example/ redirects to elsewhere.example. The tag has to be on moved.example itself (or www.moved.example), or use the DNS record.');
    });

    it('follows the www twin and reads the tag there', async () => {
        const { fetch } = replay({
            'https://cloudflare-dns.com/dns-query?name=twin.example&type=TXT': respond(200, '{"Status":3}'),
            'https://twin.example/': respond(308, '', { location: 'https://www.twin.example/' }),
            'https://www.twin.example/': respond(200, '<html><head><meta name="oc-domain-verify" content="tok-123456789012345" /></head></html>'),
        });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, 'twin.example', 'tok-123456789012345');
        expect(c.via).toBe('meta-tag');
        expect(c.meta.hops.map((h) => h.status)).toEqual([308, 200]);
    });

    it('still reads the homepage when the DNS resolver fails, and says the resolver failed', async () => {
        const { fetch } = replay({
            [`https://cloudflare-dns.com/dns-query?name=${EXAMPLES}&type=TXT`]: respond(502, 'bad gateway'),
        });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, EXAMPLES, EXAMPLES_TOKEN);
        expect(c.dns.error).toMatch(/answered 502 with a body that is not JSON|answered 502/);
        expect(c.verified).toBe(true);
    });

    it('says a single-page app has to put the tag in its static HTML', async () => {
        const { fetch } = replay({
            'https://cloudflare-dns.com/dns-query?name=spa.example&type=TXT': respond(200, '{"Status":0}'),
            'https://spa.example/': respond(200, '<html><head></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>'),
        });
        const c = await checkDomain({ fetch, lookup: lookupWith() }, 'spa.example');
        expect(c.meta.clientRendered).toBe(true);
        expect(c.meta.hint).toMatch(/single-page app: the tag must be in its static index\.html/);
    });
});
