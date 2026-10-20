/** What a site says about itself. One per site, usually in `site.config`. */
export interface SiteSeo {
    /** Absolute https origin with no trailing slash, e.g. `https://stamp.ochk.io`. */
    url: string;
    /** Appended to a page title that does not already name it, e.g. `OC Stamp`. */
    name: string;
    defaultTitle: string;
    defaultDescription: string;
    /** Absolute URL of the 1200×630 share image. Default `${url}/og.png`. */
    ogImage?: string;
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
    /** A path on this site (`/create`) or an absolute https URL. Default: the site root. */
    canonical?: string;
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
    if (site.ogImage !== undefined && !/^https?:\/\//.test(site.ogImage)) {
        throw new TypeError(`site-kit: ogImage must be an absolute URL, got ${JSON.stringify(site.ogImage)}`);
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
export function absoluteUrl(site: SiteSeo, pathOrUrl: string | undefined): string {
    if (pathOrUrl === undefined) return site.url;
    if (pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('//')) return `${site.url}${pathOrUrl}`;
    if (/^https:\/\/[^\s/]+/.test(pathOrUrl)) return pathOrUrl;
    throw new TypeError(`site-kit: expected a path starting with / or an https URL, got ${JSON.stringify(pathOrUrl)}`);
}

export function generateMetaTags(site: SiteSeo, page: PageSeo = {}): MetaTags {
    const ogImageDefault = site.ogImage ?? `${site.url}/og.png`;
    const {
        title = site.defaultTitle,
        description = site.defaultDescription,
        canonical,
        ogImage = ogImageDefault,
        ogType = 'website',
        noindex = false,
        keywords = [],
    } = page;

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
