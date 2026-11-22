/** Domain verification read the way me.ochk.io reads it (oc-me-web src/lib/developer/verify-domain.ts). */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { getJson, request, UpstreamError, type FetchLike, type ReadResult } from './http.js';

export const DOH_RESOLVER = 'https://cloudflare-dns.com/dns-query';
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const MAX_HOPS = 4;
const HOMEPAGE_MAX_BYTES = 256 * 1024;
const META_TAG_RE = /<meta\s+([^<>]{0,1000})\/?>/gi;

export type Lookup = (host: string) => Promise<string[]>;

/** A fetch whose connection goes to addresses already checked, never to a fresh lookup of the URL's host. */
export type Pin = (addresses: string[]) => { fetch: FetchLike; close: () => Promise<void> };

export const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

/** A bare hostname from a domain or a URL, lowercase, or an error that says what was wrong. */
export function normalizeDomain(raw: string): string {
    let value = raw.trim().toLowerCase();
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
        try {
            value = new URL(value).hostname;
        } catch {
            throw new Error(`"${raw}" is not a URL or a domain name.`);
        }
    }
    value = value.replace(/\.$/, '');
    if (isIP(value) || /^\[.*\]$/.test(value)) throw new Error(`"${raw}" is an IP address; give the site's domain name.`);
    if (value.length > 253 || !DOMAIN_RE.test(value)) {
        throw new Error(`"${raw}" does not look like a domain name. Use the bare name, e.g. yourapp.example, or the site's https:// URL.`);
    }
    return value;
}

/** Loopback, private, link-local, carrier-grade NAT, multicast and unspecified addresses: never fetched. */
export function isPrivateAddress(addr: string): boolean {
    const a = addr.toLowerCase();
    const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
    if (v4) {
        const [o1, o2] = [Number(v4[1]), Number(v4[2])];
        return (
            o1 === 0 ||
            o1 === 10 ||
            o1 === 127 ||
            (o1 === 100 && o2 >= 64 && o2 <= 127) ||
            (o1 === 169 && o2 === 254) ||
            (o1 === 172 && o2 >= 16 && o2 <= 31) ||
            (o1 === 192 && o2 === 168) ||
            (o1 === 198 && (o2 === 18 || o2 === 19)) ||
            o1 >= 224
        );
    }
    if (a === '::' || a === '::1') return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a);
}

/** Resolves the host once and refuses one that points inside a network; the addresses returned are the only ones to connect to. */
export async function assertPublicHost(host: string, lookup: Lookup): Promise<string[]> {
    let addrs: string[];
    try {
        addrs = await lookup(host);
    } catch (err) {
        const code = (err as { code?: string }).code;
        throw new UpstreamError(`https://${host}/`, 'network', `${host} does not resolve${code ? ` (${code})` : ''}.`, { code });
    }
    if (addrs.length === 0) throw new UpstreamError(`https://${host}/`, 'network', `${host} does not resolve.`, { code: 'ENODATA' });
    const inside = addrs.find(isPrivateAddress);
    if (inside) {
        throw new UpstreamError(
            `https://${host}/`,
            'network',
            `${host} resolves to ${inside}, a private or local address. This tool only reads public sites.`,
            { code: 'PRIVATE_ADDRESS' }
        );
    }
    return addrs;
}

/** The domain itself, or its www twin either way: the only redirects me.ochk.io's check follows. */
export function sameSite(host: string, domain: string): boolean {
    const h = host.toLowerCase().replace(/\.$/, '');
    return h === domain || h === `www.${domain}` || `www.${h}` === domain;
}

export interface Hop {
    url: string;
    status: number;
    location?: string;
}

export interface FetchedPage {
    /** Every response on the way, redirects first. */
    hops: Hop[];
    /** The page that answered without a redirect, if one did. */
    final?: ReadResult;
    /** Where a redirect left the site, when it did. */
    offsite?: string;
    /** Why nothing answered. */
    error?: UpstreamError;
}

export interface SiteDeps {
    lookup: Lookup;
    pin: Pin;
}

/** GET a URL, following up to four redirects by hand, each one checked before it is followed. */
export async function fetchFollowing(
    deps: SiteDeps,
    start: string,
    opts: { stayOn?: string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<FetchedPage> {
    const hops: Hop[] = [];
    let target = start;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
        const u = new URL(target);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return { hops, offsite: target };
        if (opts.stayOn && !sameSite(u.hostname, opts.stayOn)) return { hops, offsite: u.hostname };
        try {
            const pinned = deps.pin(await assertPublicHost(u.hostname, deps.lookup));
            let res: ReadResult;
            try {
                res = await request(pinned.fetch, target, {
                    redirect: 'manual',
                    accept: 'text/html,*/*',
                    timeoutMs: opts.timeoutMs ?? 8_000,
                    maxBytes: opts.maxBytes ?? HOMEPAGE_MAX_BYTES,
                });
            } finally {
                await pinned.close().catch(() => undefined);
            }
            const location = res.headers.get('location') ?? undefined;
            hops.push({ url: target, status: res.status, ...(location ? { location } : {}) });
            if (res.status >= 300 && res.status < 400 && location) {
                target = new URL(location, target).toString();
                continue;
            }
            return { hops, final: res };
        } catch (err) {
            if (err instanceof UpstreamError) return { hops, error: err };
            throw err;
        }
    }
    return { hops, error: new UpstreamError(target, 'network', `${start} redirects more than ${MAX_HOPS} times.`) };
}

/** TXT records as Cloudflare's resolver gives them, each record's strings joined. */
export async function txtRecords(fetchImpl: FetchLike, domain: string): Promise<string[]> {
    const url = `${DOH_RESOLVER}?name=${encodeURIComponent(domain)}&type=TXT`;
    const { status, body } = await getJson(fetchImpl, url, { accept: 'application/dns-json', timeoutMs: 8_000 });
    if (status !== 200) throw new UpstreamError(url, 'status', `${DOH_RESOLVER} answered ${status}.`, { status });
    const b = body as { Status?: number; Answer?: { type: number; data: string }[] };
    if (b.Status !== 0 || !Array.isArray(b.Answer)) return [];
    return b.Answer.filter((a) => a.type === 16).map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s+"/g, ''));
}

/** Every oc-domain-verify meta tag's content in a page, in order. */
export function metaContents(html: string): string[] {
    const out: string[] = [];
    for (const m of html.matchAll(new RegExp(META_TAG_RE.source, META_TAG_RE.flags))) {
        const attrs = m[1] ?? '';
        const name = /\bname\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (!name || name[1]!.toLowerCase() !== 'oc-domain-verify') continue;
        const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (content) out.push(content[1]!);
    }
    return out;
}

/** An app shell whose content a script draws: a tag added after load is never seen by the check. */
export function looksClientRendered(html: string): boolean {
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
    const text = body
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    return /<div id="(root|app|__next|svelte)"\s*>\s*<\/div>/i.test(body) || (text.length < 40 && /<script/i.test(body));
}

export interface DomainCheck {
    domain: string;
    token?: string;
    /** True when a token was given and either channel carries it. */
    verified?: boolean;
    via?: 'dns-txt' | 'meta-tag';
    dns: { ok: boolean; records: string[]; ocVerify: string[]; error?: string; hint?: string };
    meta: {
        ok: boolean;
        fetched: boolean;
        status?: number;
        contents: string[];
        hops: Hop[];
        offsite?: string;
        clientRendered?: boolean;
        error?: string;
        hint?: string;
    };
}

export interface DomainDeps extends SiteDeps {
    /** For the DNS-over-HTTPS resolver; the site itself is read through pin. */
    fetch: FetchLike;
}

export async function checkDomain(deps: DomainDeps, rawDomain: string, rawToken?: string): Promise<DomainCheck> {
    const domain = normalizeDomain(rawDomain);
    let token = rawToken?.trim() || undefined;
    if (token?.startsWith('oc-verify=')) token = token.slice('oc-verify='.length);
    const expectedTxt = token ? `oc-verify=${token}` : undefined;

    const dns: DomainCheck['dns'] = { ok: false, records: [], ocVerify: [] };
    try {
        dns.records = await txtRecords(deps.fetch, domain);
        dns.ocVerify = dns.records.filter((r) => r.startsWith('oc-verify='));
        dns.ok = !!expectedTxt && dns.records.includes(expectedTxt);
        if (dns.records.length === 0) {
            dns.hint = `No TXT records came back for ${domain}. Add the record at the apex (host @) and allow about 30 seconds for it to propagate.`;
        } else if (dns.ocVerify.length === 0) {
            dns.hint = `${domain} has TXT records, but none start with oc-verify=.`;
        } else if (token && !dns.ok) {
            dns.hint = `${domain} has ${dns.ocVerify.length} oc-verify record${dns.ocVerify.length === 1 ? '' : 's'}, but none match the token given. An older token may have been pasted.`;
        }
    } catch (err) {
        dns.error = err instanceof Error ? err.message : String(err);
        dns.hint = `The TXT records could not be read through ${DOH_RESOLVER}: ${dns.error}`;
    }

    const meta: DomainCheck['meta'] = { ok: false, fetched: false, contents: [], hops: [] };
    const page = await fetchFollowing(deps, `https://${domain}/`, { stayOn: domain });
    meta.hops = page.hops;
    if (page.error) {
        meta.error = page.error.message;
        meta.hint = `https://${domain}/ could not be read: ${page.error.message} Check that the name resolves, the homepage is public and its certificate is valid.`;
    } else if (page.offsite) {
        meta.fetched = true;
        meta.offsite = page.offsite;
        meta.status = page.hops.at(-1)?.status;
        meta.hint = `https://${domain}/ redirects to ${page.offsite}. The tag has to be on ${domain} itself (or www.${domain}), or use the DNS record.`;
    } else if (page.final) {
        meta.fetched = true;
        meta.status = page.final.status;
        if (page.final.status < 200 || page.final.status >= 300) {
            meta.hint = `https://${domain}/ answered with status ${page.final.status}. The check needs the homepage itself, with a 2xx status.`;
        } else {
            meta.contents = metaContents(page.final.text);
            meta.ok = !!token && meta.contents.includes(token);
            if (meta.contents.length === 0) {
                meta.clientRendered = looksClientRendered(page.final.text);
                meta.hint =
                    `The homepage at https://${domain}/ has no <meta name="oc-domain-verify" content="…" /> in the HTML it sends.` +
                    (meta.clientRendered
                        ? ' It looks like a single-page app: the tag must be in its static index.html, since one added by JavaScript after load is never seen.'
                        : '');
            } else if (token && !meta.ok) {
                meta.hint = 'The homepage has an oc-domain-verify tag, but its content does not match the token given.';
            }
        }
    }

    const verified = token ? dns.ok || meta.ok : undefined;
    return {
        domain,
        ...(token ? { token } : {}),
        ...(verified !== undefined ? { verified } : {}),
        ...(dns.ok ? { via: 'dns-txt' as const } : meta.ok ? { via: 'meta-tag' as const } : {}),
        dns,
        meta,
    };
}

export function formatDomainCheck(c: DomainCheck): string {
    const out: string[] = [`# Domain verification: ${c.domain}`, ''];
    if (c.token) {
        out.push(
            c.verified
                ? `Found the token through ${c.via === 'dns-txt' ? 'the DNS TXT record' : 'the meta tag'}. Press Verify on your project at https://ochk.app/me/projects so me.ochk.io records it: only its own check counts.`
                : 'The token was not found on either channel. me.ochk.io would not verify this domain yet.'
        );
    } else {
        out.push(
            'No token was given, so this lists what the domain publishes. Compare it with the token on your project at https://ochk.app/me/projects, or call again with the token.'
        );
    }
    out.push('');
    out.push(`## DNS TXT at ${c.domain}`);
    if (c.dns.error) out.push(`- Not read: ${c.dns.error}`);
    else {
        out.push(`- oc-verify records: ${c.dns.ocVerify.length ? c.dns.ocVerify.join(', ') : 'none'}`);
        out.push(`- All TXT records: ${c.dns.records.length}`);
    }
    if (c.dns.hint && !c.dns.ok) out.push(`- ${c.dns.hint}`);
    out.push('');
    out.push(`## Meta tag at https://${c.domain}/`);
    for (const h of c.meta.hops) out.push(`- ${h.url} answered ${h.status}${h.location ? ` → ${h.location}` : ''}`);
    if (c.meta.fetched && !c.meta.offsite) {
        out.push(`- oc-domain-verify tags: ${c.meta.contents.length ? c.meta.contents.join(', ') : 'none'}`);
    }
    if (c.meta.hint && !c.meta.ok) out.push(`- ${c.meta.hint}`);
    out.push('');
    out.push('Either record is enough: `oc-verify=<token>` as a TXT record at the apex, or `<meta name="oc-domain-verify" content="<token>" />` in the <head> of https://' + c.domain + '/.');
    out.push('Docs: https://ochk.io/docs/me/quickstart#5--go-live');
    return out.join('\n');
}
