import { describe, expect, it } from 'vitest';

import { classifyRequestOrigin, FAMILY_ORIGINS, isFamilyOrigin, refuseCookieSession } from './origin';

const req = (headers: Record<string, string>, method = 'POST') => ({ method, headers });

describe('isFamilyOrigin', () => {
    it('admits each listed site over https, exactly', () => {
        for (const o of FAMILY_ORIGINS) expect(isFamilyOrigin(o, false)).toBe(true);
    });

    it('matches oc-www FAMILY_ORIGINS as of 2026-10-20', () => {
        expect([...FAMILY_ORIGINS].sort()).toEqual(
            [
                'https://ochk.io',
                'https://me.ochk.io',
                'https://attest.ochk.io',
                'https://lock.ochk.io',
                'https://vote.ochk.io',
                'https://stamp.ochk.io',
                'https://agent.ochk.io',
                'https://pledge.ochk.io',
                'https://docs.ochk.io',
                'https://vault.ochk.io',
                'https://chat.ochk.io',
                'https://cosign.ochk.io',
                'https://me-demo.ochk.io',
                'https://globe.ochk.io',
                'https://btc.ochk.io',
                'https://analytics.ochk.io',
                'https://bot.ochk.io',
                'https://forge.ochk.io',
            ].sort()
        );
    });

    it('refuses plain http, other ports, unlisted subdomains and lookalikes', () => {
        for (const o of [
            'http://vault.ochk.io',
            'https://vault.ochk.io:8443',
            'https://vault.ochk.io/',
            'https://status.ochk.io',
            'https://fleet.ochk.io',
            'https://evil-ochk.io',
            'https://ochk.io.evil.example',
            'https://VAULT.ochk.io',
            'null',
            '',
        ]) {
            expect(isFamilyOrigin(o, false)).toBe(false);
        }
        expect(isFamilyOrigin(undefined, false)).toBe(false);
    });

    it('admits localhost only while developing', () => {
        expect(isFamilyOrigin('http://localhost:3000', true)).toBe(true);
        expect(isFamilyOrigin('http://localhost:3000', false)).toBe(false);
        expect(isFamilyOrigin('http://127.0.0.1:5173', false)).toBe(false);
    });
});

describe('classifyRequestOrigin', () => {
    it('prefers Sec-Fetch-Site, which page JavaScript cannot set', () => {
        expect(classifyRequestOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe('same-origin');
        expect(classifyRequestOrigin(req({ 'sec-fetch-site': 'same-site' }))).toBe('same-site');
        expect(classifyRequestOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe('cross-site');
        expect(classifyRequestOrigin(req({ 'sec-fetch-site': 'none' }))).toBe('cross-site');
        expect(classifyRequestOrigin(req({ 'sec-fetch-site': 'garbage' }))).toBe('cross-site');
    });

    it('falls back to Origin against Host', () => {
        expect(classifyRequestOrigin(req({ origin: 'https://a.ochk.io', host: 'a.ochk.io' }))).toBe('same-origin');
        expect(classifyRequestOrigin(req({ origin: 'https://evil.example', host: 'a.ochk.io' }))).toBe('cross-site');
        expect(classifyRequestOrigin(req({ origin: '://', host: 'a.ochk.io' }))).toBe('cross-site');
    });

    it('reports unknown when the request declares neither', () => {
        expect(classifyRequestOrigin(req({}))).toBe('unknown');
    });
});

describe('refuseCookieSession', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses a cross-site %s', (method) => {
        expect(refuseCookieSession(req({ 'sec-fetch-site': 'cross-site' }, method), { developing: false })).toBe(true);
    });

    it('refuses an unsafe method that declares no origin', () => {
        expect(refuseCookieSession(req({}, 'POST'), { developing: false })).toBe(true);
    });

    it('allows the app talking to itself', () => {
        expect(refuseCookieSession(req({ 'sec-fetch-site': 'same-origin' }), { developing: false })).toBe(false);
    });

    it('allows a listed family site calling across origins', () => {
        const vault = { 'sec-fetch-site': 'same-site', origin: 'https://vault.ochk.io' };
        expect(refuseCookieSession(req(vault, 'POST'), { developing: false })).toBe(false);
        expect(refuseCookieSession(req({ ...vault, origin: 'https://me.ochk.io' }, 'DELETE'), { developing: false })).toBe(false);
    });

    it('refuses a same-site name that is not a listed family site, or that names none', () => {
        for (const origin of ['https://status.ochk.io', 'https://fleet.ochk.io', 'http://vault.ochk.io', 'https://vault.ochk.io:8443']) {
            expect(refuseCookieSession(req({ 'sec-fetch-site': 'same-site', origin }), { developing: false })).toBe(true);
        }
        expect(refuseCookieSession(req({ 'sec-fetch-site': 'same-site' }), { developing: false })).toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('never refuses %s: arriving from a link is a cross-site GET', (method) => {
        expect(refuseCookieSession(req({ 'sec-fetch-site': 'cross-site' }, method))).toBe(false);
    });

    it('treats a method it does not recognise as unsafe', () => {
        expect(refuseCookieSession(req({ 'sec-fetch-site': 'cross-site' }, 'get'))).toBe(true);
    });
});
