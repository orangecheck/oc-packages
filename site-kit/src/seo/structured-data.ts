import { absoluteUrl, type SiteSeo } from './meta';

/** One schema.org node. */
export type JsonLdNode = Record<string, unknown> & { '@context': 'https://schema.org'; '@type': string };

const CONTEXT = 'https://schema.org' as const;

/** The site itself. `search` is a path template containing `{search_term_string}`. */
export function webSite(site: SiteSeo, opts: { search?: string } = {}): JsonLdNode {
    const node: JsonLdNode = {
        '@context': CONTEXT,
        '@type': 'WebSite',
        name: site.name,
        url: site.url,
        description: site.defaultDescription,
    };
    if (opts.search !== undefined) {
        if (!opts.search.includes('{search_term_string}')) {
            throw new TypeError('site-kit: webSite search template must contain {search_term_string}');
        }
        node.potentialAction = {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: absoluteUrl(site, opts.search) },
            'query-input': 'required name=search_term_string',
        };
    }
    return node;
}

export interface OrganizationOptions {
    name: string;
    url: string;
    /** Absolute URL of a logo that answers 200. */
    logo: string;
    description: string;
    sameAs?: readonly string[];
}

export function organization(opts: OrganizationOptions): JsonLdNode {
    const node: JsonLdNode = {
        '@context': CONTEXT,
        '@type': 'Organization',
        name: opts.name,
        url: opts.url,
        logo: opts.logo,
        description: opts.description,
    };
    if (opts.sameAs) node.sameAs = [...opts.sameAs];
    return node;
}

export interface SoftwareApplicationOptions {
    name?: string;
    description?: string;
    /** Path on this site or absolute https URL. Default: the site root. */
    url?: string;
    applicationCategory: string;
    operatingSystem: string;
    /** Default: free (`price: '0'`, USD). */
    offers?: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}

export function softwareApplication(site: SiteSeo, opts: SoftwareApplicationOptions): JsonLdNode {
    return {
        '@context': CONTEXT,
        '@type': 'SoftwareApplication',
        name: opts.name ?? site.name,
        description: opts.description ?? site.defaultDescription,
        url: absoluteUrl(site, opts.url),
        applicationCategory: opts.applicationCategory,
        operatingSystem: opts.operatingSystem,
        offers: opts.offers ?? { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    };
}

export function techArticle(
    site: SiteSeo,
    opts: { headline?: string; description?: string; url?: string; author?: string } = {}
): JsonLdNode {
    return {
        '@context': CONTEXT,
        '@type': 'TechArticle',
        headline: opts.headline ?? site.defaultTitle,
        description: opts.description ?? site.defaultDescription,
        url: absoluteUrl(site, opts.url),
        author: { '@type': 'Organization', name: opts.author ?? 'OrangeCheck' },
    };
}

/** One page. `url` is resolved against the site, so it is always absolute. */
export function webPage(site: SiteSeo, opts: { name?: string; description?: string; url?: string } = {}): JsonLdNode {
    return {
        '@context': CONTEXT,
        '@type': 'WebPage',
        name: opts.name ?? site.defaultTitle,
        description: opts.description ?? site.defaultDescription,
        url: absoluteUrl(site, opts.url),
    };
}
