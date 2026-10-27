// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://vault.ochk.io/"}
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    familyPageUrl,
    FamilyAnalytics,
    onlyOnOrigins,
    plausibleSenderScript,
    useFamilyPageviews,
} from './index';

// A key in the fragment, a token and a return address in the query.
const KEY = 'q7Zr0Lw2xYc9VbN4mKpT8sJdHgFeA1uOiE6yRtWzX3c';
const SECRET_PAGE = `/share/abc123?token=tok123&return_to=%2Fx%23${KEY}&utm_source=nostr#k=${KEY}`;

let beacons: { url: string; body: Record<string, unknown> }[] = [];

/** Run the sender as the page would, with sendBeacon recording what leaves. */
async function loadSender() {
    beacons = [];
    Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: (url: string, data: Blob) => {
            void data.text().then((t) => beacons.push({ url, body: JSON.parse(t) }));
            return true;
        },
    });
    new Function(plausibleSenderScript('ochk.io', '/oc-insights/event'))();
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    delete window.plausible;
    window.history.replaceState(null, '', SECRET_PAGE);
});
afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document, 'referrer', { configurable: true, value: '' });
});

describe('familyPageUrl', () => {
    it('keeps origin, path and campaign tags, nothing else', () => {
        expect(familyPageUrl(`https://vault.ochk.io${SECRET_PAGE}`)).toBe(
            'https://vault.ochk.io/share/abc123?utm_source=nostr'
        );
        expect(familyPageUrl('https://ochk.io/signin?return_to=%2Fvault#x')).toBe('https://ochk.io/signin');
    });
});

describe('the Plausible sender', () => {
    it('reports a page as origin and path, never its fragment or other query', async () => {
        await loadSender();
        window.plausible!('pageview');
        await flush();
        expect(beacons).toHaveLength(1);
        const sent = JSON.stringify(beacons[0]);
        expect(beacons[0]!.body).toMatchObject({
            n: 'pageview',
            u: `${window.location.origin}/share/abc123?utm_source=nostr`,
            d: 'ochk.io',
            r: null,
        });
        expect(sent).not.toContain(KEY.slice(0, 10));
        expect(sent).not.toContain('tok123');
        expect(sent).not.toContain('return_to');
    });

    it('sends a referrer as its origin, and only from another site', async () => {
        await loadSender();
        Object.defineProperty(document, 'referrer', {
            configurable: true,
            value: `https://news.example/thread?id=9#c${KEY}`,
        });
        window.plausible!('pageview');
        Object.defineProperty(document, 'referrer', {
            configurable: true,
            value: `${window.location.origin}/vault/team/join?token=tok123`,
        });
        window.plausible!('pageview');
        await flush();
        expect(beacons.map((b) => b.body.r)).toEqual(['https://news.example/', null]);
    });

    it('sends events queued before it loaded, with their props, through the same path', async () => {
        window.plausible = Object.assign(() => {}, { q: [['Signup', { props: { plan: 'annual' } }]] });
        await loadSender();
        await flush();
        expect(beacons[0]!.body).toMatchObject({ n: 'Signup', p: { plan: 'annual' } });
        expect(JSON.stringify(beacons[0])).not.toContain('tok123');
    });

    it('reports a link to another site by its origin and path', async () => {
        await loadSender();
        const a = document.createElement('a');
        a.href = `https://lock.ochk.io/unlock?x=1#${KEY}`;
        a.addEventListener('click', (e) => e.preventDefault());
        document.body.appendChild(a);
        a.click();
        await flush();
        expect(beacons[0]!.body).toMatchObject({
            n: 'Outbound Link: Click',
            p: { url: 'https://lock.ochk.io/unlock' },
        });
    });

    it('never reads the fragment or the full address', () => {
        const script = plausibleSenderScript('ochk.io', '/oc-insights/event');
        expect(script).not.toMatch(/location\.(hash|href)|loc\.(hash|href)/);
    });

    it('sends nothing for a person who opted out', async () => {
        localStorage.setItem('plausible_ignore', 'true');
        await loadSender();
        window.plausible!('pageview');
        localStorage.removeItem('plausible_ignore');
        await flush();
        expect(beacons).toHaveLength(0);
    });
});

describe('FamilyAnalytics', () => {
    it('renders the sender and the oc-pulse loader when enabled', () => {
        const html = renderToStaticMarkup(<FamilyAnalytics enabled />);
        expect(html).toContain('data-oc-analytics="plausible"');
        expect(html).toContain('data-oc-analytics="ocpulse"');
        expect(html).toContain('"/oc-insights/event"');
        expect(html).not.toContain('script.hash');
    });

    it('renders nothing outside production by default', () => {
        expect(renderToStaticMarkup(<FamilyAnalytics />)).toBe('');
    });

    it('turns a beacon off rather than write an unsafe value into the page', () => {
        const html = renderToStaticMarkup(
            <FamilyAnalytics enabled domain={'ochk.io"</script><script>alert(1)'} pulseSrc="javascript:alert(1)" />
        );
        expect(html).toBe('');
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

    it('sends from a listed origin and from no other', async () => {
        beacons = [];
        Object.defineProperty(navigator, 'sendBeacon', {
            configurable: true,
            value: (url: string, data: Blob) => {
                void data.text().then((t) => beacons.push({ url, body: JSON.parse(t) }));
                return true;
            },
        });
        const [elsewhere] = scripts(['https://ochk.io']);
        new Function(elsewhere!)();
        expect(window.plausible).toBeUndefined();
        const [here] = scripts(['https://vault.ochk.io']);
        new Function(here!)();
        window.plausible!('pageview');
        await flush();
        expect(beacons).toHaveLength(1);
    });

    it('loads oc-pulse on a listed origin and not on another', () => {
        const pulse = (origins: readonly string[]) => {
            document.head.querySelectorAll('script[src*="oc-pulse"]').forEach((s) => s.remove());
            delete (window as { ocpulse?: unknown }).ocpulse;
            new Function(scripts(origins)[1]!)();
            return document.head.querySelectorAll('script[src*="oc-pulse"]').length;
        };
        expect(pulse(['https://ochk.io'])).toBe(0);
        expect((window as { ocpulse?: unknown }).ocpulse).toBeUndefined();
        expect(pulse(['https://vault.ochk.io'])).toBe(1);
    });

    it('renders nothing when an origin is not one, and as before without the list', () => {
        expect(renderToStaticMarkup(<FamilyAnalytics enabled origins={['https://ochk.io/']} />)).toBe('');
        expect(renderToStaticMarkup(<FamilyAnalytics enabled />)).toContain('data-oc-analytics="ocpulse"');
    });
});

describe('useFamilyPageviews', () => {
    it('counts a new path once, as oc-pulse and Plausible do', async () => {
        const calls: string[] = [];
        window.plausible = (name: string) => void calls.push(`${name} ${window.location.pathname}`);
        function App() {
            useFamilyPageviews();
            return null;
        }
        const root = createRoot(document.createElement('div'));
        await act(async () => root.render(<App />));
        expect(calls).toEqual(['pageview /share/abc123']);
        // The same path with another query, by replace or push (a shallow route, a campaign tag): not a new page.
        window.history.replaceState(null, '', '/share/abc123?view=x&utm_source=other#k=again');
        window.history.pushState(null, '', '/share/abc123?view=y');
        expect(calls).toHaveLength(1);
        // A client-side route change, as Next's router makes it.
        window.history.pushState(null, '', '/pricing#plans');
        // Back: the browser moves the address, then fires popstate.
        window.history.replaceState(null, '', '/share/abc123');
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(calls).toEqual(['pageview /share/abc123', 'pageview /pricing', 'pageview /share/abc123']);
        // A replace to another path is not counted, by either lane.
        window.history.replaceState(null, '', '/signin');
        expect(calls).toHaveLength(3);
        await act(async () => root.unmount());
        // Unmounted, history is its own again.
        window.history.pushState(null, '', '/elsewhere');
        expect(calls).toHaveLength(3);
    });

    it('imports nothing from Next', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const src = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
        expect(src).not.toMatch(/from ['"]next(\/|['"])/);
    });
});
