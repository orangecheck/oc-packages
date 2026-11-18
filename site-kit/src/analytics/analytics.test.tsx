// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://vault.ochk.io/"}
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { familyAnalyticsScripts, FamilyAnalytics, onlyOnOrigins } from './index';

describe('FamilyAnalytics', () => {
    it('renders the oc-pulse loader when enabled', () => {
        const html = renderToStaticMarkup(<FamilyAnalytics enabled />);
        expect(html).toContain('data-oc-analytics="ocpulse"');
        expect(html).toContain('"https://insights.ochk.io/oc-pulse.js"');
        expect(html).toContain('"https://insights.ochk.io/oc-pulse/event"');
    });

    it('writes no Plausible script, and nothing it writes names Plausible', () => {
        for (const props of [{ enabled: true }, { enabled: true, origins: ['https://vault.ochk.io'] }] as const) {
            const html = renderToStaticMarkup(<FamilyAnalytics {...props} />);
            expect(html.match(/<script/g)).toHaveLength(1);
            expect(html).toContain('data-oc-analytics="ocpulse"');
            expect(html).not.toMatch(/plausible/i);
            expect(Object.keys(familyAnalyticsScripts(props))).toEqual(['ocpulse']);
        }
    });

    it('renders nothing outside production by default', () => {
        expect(renderToStaticMarkup(<FamilyAnalytics />)).toBe('');
        expect(familyAnalyticsScripts()).toEqual({ ocpulse: '' });
    });

    it('writes exactly the text familyAnalyticsScripts gives, which a policy hashes', () => {
        const props = { enabled: true, origins: ['https://ochk.io'] } as const;
        const html = renderToStaticMarkup(<FamilyAnalytics {...props} />);
        const written = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        const { ocpulse } = familyAnalyticsScripts(props);
        expect(written).toEqual([ocpulse]);
        expect(ocpulse).toContain('"https://ochk.io"');
    });

    it('turns oc-pulse off rather than write an unsafe value into the page', () => {
        expect(renderToStaticMarkup(<FamilyAnalytics enabled pulseSrc="javascript:alert(1)" />)).toBe('');
        const html = renderToStaticMarkup(<FamilyAnalytics enabled pulseApi={'x"</script><script>alert(1)'} />);
        expect(html).toContain('data-oc-analytics="ocpulse"');
        expect(html).not.toContain('alert(1)');
    });
});

describe('onlyOnOrigins', () => {
    // This page is https://vault.ochk.io (the environment's url).
    const run = (origins: readonly string[]) => {
        delete (window as { ran?: boolean }).ran;
        const text = onlyOnOrigins(origins, 'window.ran = true;');
        if (text) new Function(text)();
        return (window as { ran?: boolean }).ran === true;
    };

    it('runs the script only on a listed origin, compared exactly', () => {
        expect(run(['https://vault.ochk.io'])).toBe(true);
        expect(run(['https://ochk.io', 'https://vault.ochk.io'])).toBe(true);
        expect(run(['https://ochk.io'])).toBe(false);
        // Neither a prefix nor a suffix of the page's origin counts.
        expect(run(['https://vault.ochk.i'])).toBe(false);
        expect(run(['https://ault.ochk.io'])).toBe(false);
        expect(run(['https://vault.ochk.io.evil.example'])).toBe(false);
    });

    it('runs nowhere for an empty list or anything that is not an origin', () => {
        const bad: string[][] = [
            [],
            ['https://vault.ochk.io/'],
            ['http://vault.ochk.io'],
            ['https://Vault.ochk.io'],
            ['https://vault.ochk.io:443'],
            ['vault.ochk.io'],
            ['https://vault.ochk.io"];alert(1);//'],
            ['https://vault.ochk.io', 'https://ochk.io/'],
        ];
        for (const origins of bad) expect(onlyOnOrigins(origins, 'window.ran = true;')).toBe('');
    });
});

describe('FamilyAnalytics on its production origins only', () => {
    const scripts = (origins: readonly string[]) => {
        const host = document.createElement('div');
        host.innerHTML = renderToStaticMarkup(<FamilyAnalytics enabled origins={origins} />);
        return [...host.querySelectorAll('script')].map((s) => s.textContent ?? '');
    };

    it('loads oc-pulse on a listed origin and not on another, and nothing else', () => {
        const pulse = (origins: readonly string[]) => {
            document.head.querySelectorAll('script[src*="oc-pulse"]').forEach((s) => s.remove());
            delete (window as { ocpulse?: unknown }).ocpulse;
            new Function(scripts(origins)[0]!)();
            return document.head.querySelectorAll('script[src*="oc-pulse"]').length;
        };
        expect(pulse(['https://ochk.io'])).toBe(0);
        expect((window as { ocpulse?: unknown }).ocpulse).toBeUndefined();
        expect(pulse(['https://vault.ochk.io'])).toBe(1);
        expect(document.head.querySelectorAll('script')).toHaveLength(1);
        expect('plausible' in window).toBe(false);
    });

    it('renders nothing when an origin is not one, and as before without the list', () => {
        expect(renderToStaticMarkup(<FamilyAnalytics enabled origins={['https://ochk.io/']} />)).toBe('');
        expect(renderToStaticMarkup(<FamilyAnalytics enabled />)).toContain('data-oc-analytics="ocpulse"');
    });
});

describe('the analytics entry', () => {
    it('imports nothing from Next', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const src = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
        expect(src).not.toMatch(/from ['"]next(\/|['"])/);
    });
});
