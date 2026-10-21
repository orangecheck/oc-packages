/** What a site says about itself. One per site, usually in `site.config`. */
export interface SiteSeo {
    /** Absolute https origin with no trailing slash, e.g. `https://stamp.ochk.io`. */
    url: string;
    /** Appended to a page title that does not already name it, e.g. `OC Stamp`. */
    name: string;
    defaultTitle: string;
    defaultDescription: string;
    /**
     * The 1200×630 share image: one absolute URL, or one per page from its
     * title. Default: the card from `ogRoute` when set, else `${url}/og.png`.
     */
    ogImage?: string | ((title: string) => string);
    /**
     * This site's share-card route, e.g. `/api/og` (`createOgHandler`). Each
     * page then shares the card with its own title, without the site name.
     */
    ogRoute?: string;
    /** When set, pages also emit `og:image:type`. */
    ogImageType?: string;
    /** Between a page title and the site name. Default `' | '`. */
    titleSeparator?: string;
    /**
     * A title that matches gets no suffix. Default: `orangecheck`, or the site
     * name with a leading `OC ` read as `oc ` or `oc·` (so `create · oc·stamp`
     * already names OC Stamp).
     */
    brand?: RegExp;
}

/** What one page says about itself. */
export interface PageSeo {
    title?: string;
    description?: string;
    /**
     * A path on this site (`/create`) or an absolute https URL. Required: a
     * tool site's root redirects, so no page may fall back to it.
     */
    canonical: string;
    /** Absolute URL of this page's share image. Default: the site's. */
    ogImage?: string;
    ogType?: 'website' | 'article';
    noindex?: boolean;
    keywords?: readonly string[];
}

export interface MetaTags {
    title: string;
    description: string;
    canonical: string;
    openGraph: {
        type: 'website' | 'article';
        url: string;
        title: string;
        description: string;
        siteName: string;
        images: Array<{ url: string; width: number; height: number; alt: string; type?: string }>;
    };
    twitter: {
        card: 'summary_large_image';
        title: string;
        description: string;
        images: string[];
    };
    robots: { index: boolean; follow: boolean };
    keywords: string | undefined;
}

const ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Check a site's SEO values once, where they enter. Throws on a URL that is
 * not a bare https origin (localhost is allowed for development).
 */
export function defineSite<T extends SiteSeo>(site: T): Readonly<T> {
    if (!ORIGIN.test(site.url) && !LOCAL.test(site.url)) {
        throw new TypeError(`site-kit: site url must be an https origin with no path or trailing slash, got ${JSON.stringify(site.url)}`);
    }
    if (!site.name.trim()) throw new TypeError('site-kit: site name is empty');
    if (typeof site.ogImage === 'string' && !/^https?:\/\//.test(site.ogImage)) {
        throw new TypeError(`site-kit: ogImage must be an absolute URL, got ${JSON.stringify(site.ogImage)}`);
    }
    if (site.ogRoute !== undefined && !/^\/[\w./-]*$/.test(site.ogRoute)) {
        throw new TypeError(`site-kit: ogRoute must be a path such as /api/og, got ${JSON.stringify(site.ogRoute)}`);
    }
    return Object.freeze({ ...site });
}

function brandOf(site: SiteSeo): RegExp {
    if (site.brand) return site.brand;
    const name = site.name.startsWith('OC ') ? `oc[ ·]${escapeRegExp(site.name.slice(3))}` : escapeRegExp(site.name);
    return new RegExp(`orangecheck|${name}`, 'i');
}

/** True when the title already names the product or the family. */
export function namesBrand(site: SiteSeo, title: string): boolean {
    return brandOf(site).test(title);
}

/** The document title: the site name is appended only when the title does not name it. */
export function pageTitle(site: SiteSeo, title: string): string {
    return namesBrand(site, title) ? title : `${title}${site.titleSeparator ?? ' | '}${site.name}`;
}

/** Resolve a path on this site, or pass through an absolute https URL. */
export function absoluteUrl(site: SiteSeo, pathOrUrl: string): string {
    if (typeof pathOrUrl !== 'string') {
        throw new TypeError(`site-kit: expected a path or an https URL, got ${JSON.stringify(pathOrUrl)}`);
    }
    if (pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('//')) return `${site.url}${pathOrUrl}`;
    if (/^https:\/\/[^\s/]+/.test(pathOrUrl)) return pathOrUrl;
    throw new TypeError(`site-kit: expected a path starting with / or an https URL, got ${JSON.stringify(pathOrUrl)}`);
}

/** A page title as its share card shows it: the site's name, at either end, is already on the card. */
export function cardTitle(site: SiteSeo, title: string): string {
    const name = escapeRegExp(site.name);
    const sep = '\\s*(?:[·|:–—-])\\s*';
    const cut = title.replace(new RegExp(`${sep}${name}$`), '').replace(new RegExp(`^${name}${sep}`), '').trim();
    return cut || title;
}

/** The share image for a page with this title, as the site asks for it. */
export function siteOgImage(site: SiteSeo, title: string): string {
    if (typeof site.ogImage === 'string') return site.ogImage;
    const url = site.ogImage
        ? site.ogImage(title)
        : site.ogRoute
          ? `${site.url}${site.ogRoute}?title=${encodeURIComponent(cardTitle(site, title))}`
          : `${site.url}/og.png`;
    if (!/^https?:\/\//.test(url)) throw new TypeError(`site-kit: ogImage(title) must give an absolute URL, got ${JSON.stringify(url)}`);
    return url;
}

export function generateMetaTags(site: SiteSeo, page: PageSeo): MetaTags {
    if (typeof page?.canonical !== 'string') {
        throw new TypeError('site-kit: a page needs its canonical, e.g. canonical="/create"; the site root may redirect');
    }
    const {
        title = site.defaultTitle,
        description = site.defaultDescription,
        canonical,
        ogType = 'website',
        noindex = false,
        keywords = [],
    } = page;
    const ogImage = page.ogImage ?? siteOgImage(site, title);

    const fullTitle = pageTitle(site, title);
    const canonicalUrl = absoluteUrl(site, canonical);
    const image: MetaTags['openGraph']['images'][number] = { url: ogImage, width: 1200, height: 630, alt: title };
    if (site.ogImageType) image.type = site.ogImageType;

    return {
        title: fullTitle,
        description,
        canonical: canonicalUrl,
        openGraph: {
            type: ogType,
            url: canonicalUrl,
            title: fullTitle,
            description,
            siteName: site.name,
            images: [image],
        },
        twitter: {
            card: 'summary_large_image',
            title: fullTitle,
            description,
            images: [ogImage],
        },
        robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
        keywords: keywords.length > 0 ? keywords.join(', ') : undefined,
    };
}
