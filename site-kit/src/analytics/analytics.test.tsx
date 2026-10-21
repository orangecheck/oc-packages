// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://vault.ochk.io/"}
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const events = { on: vi.fn(), off: vi.fn() };
vi.mock('next/router.js', () => ({ useRouter: () => ({ events }) }));

import {
    familyPageUrl,
    FamilyAnalytics,
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

describe('useFamilyPageviews', () => {
    it('reports the page once, then each new path', async () => {
        const calls: string[] = [];
        window.plausible = (name: string) => void calls.push(`${name} ${window.location.pathname}`);
        function App() {
            useFamilyPageviews();
            return null;
        }
        const root = createRoot(document.createElement('div'));
        await act(async () => root.render(<App />));
        expect(calls).toEqual(['pageview /share/abc123']);
        const report = events.on.mock.calls[0]![1] as () => void;
        report(); // the same page again: not counted twice
        window.history.replaceState(null, '', '/pricing#plans');
        report();
        expect(calls).toEqual(['pageview /share/abc123', 'pageview /pricing']);
        await act(async () => root.unmount());
        expect(events.off).toHaveBeenCalled();
    });
});
