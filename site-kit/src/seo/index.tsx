// The .js suffix: next has no exports map, so Node's ESM loader needs the file name.
import Head from 'next/head.js';
import type { ReactElement } from 'react';

import { jsonLd } from './json-ld';
import { generateMetaTags, type PageSeo, type SiteSeo } from './meta';
import {
    organization,
    softwareApplication,
    techArticle,
    webPage,
    webSite,
    type JsonLdNode,
} from './structured-data';

export { jsonLd } from './json-ld';
export {
    absoluteUrl,
    defineSite,
    generateMetaTags,
    namesBrand,
    pageTitle,
    type MetaTags,
    type PageSeo,
    type SiteSeo,
} from './meta';
export {
    organization,
    softwareApplication,
    techArticle,
    webPage,
    webSite,
    type JsonLdNode,
    type OrganizationOptions,
    type SoftwareApplicationOptions,
} from './structured-data';

export type StructuredData = Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;

export interface SeoProps extends PageSeo {
    site: SiteSeo;
    structuredData?: StructuredData;
}

/**
 * Every head tag a page needs: title, description, canonical, Open Graph,
 * Twitter, robots and JSON-LD. Each tag is a flat keyed sibling so Next's
 * `<Head>` de-dupes predictably (a Fragment-wrapped list once dropped
 * `og:image` from every family page).
 */
export function Seo({ site, structuredData, ...page }: SeoProps): ReactElement {
    const meta = generateMetaTags(site, page);
    const ogImage = meta.openGraph.images[0];
    const twitterImage = meta.twitter.images[0];

    return (
        <Head>
            <title key="title">{meta.title}</title>
            <meta key="m-title" name="title" content={meta.title} />
            <meta key="m-description" name="description" content={meta.description} />
            {meta.keywords && <meta key="m-keywords" name="keywords" content={meta.keywords} />}
            <link key="canonical" rel="canonical" href={meta.canonical} />
            <meta key="og:type" property="og:type" content={meta.openGraph.type} />
            <meta key="og:url" property="og:url" content={meta.openGraph.url} />
            <meta key="og:title" property="og:title" content={meta.openGraph.title} />
            <meta key="og:description" property="og:description" content={meta.openGraph.description} />
            <meta key="og:site_name" property="og:site_name" content={meta.openGraph.siteName} />
            {ogImage && <meta key="og:image" property="og:image" content={ogImage.url} />}
            {ogImage?.type && <meta key="og:image:type" property="og:image:type" content={ogImage.type} />}
            {ogImage && <meta key="og:image:width" property="og:image:width" content={String(ogImage.width)} />}
            {ogImage && <meta key="og:image:height" property="og:image:height" content={String(ogImage.height)} />}
            {ogImage && <meta key="og:image:alt" property="og:image:alt" content={ogImage.alt} />}
            <meta key="tw:card" name="twitter:card" content={meta.twitter.card} />
            <meta key="tw:title" name="twitter:title" content={meta.twitter.title} />
            <meta key="tw:description" name="twitter:description" content={meta.twitter.description} />
            {twitterImage && <meta key="tw:image" name="twitter:image" content={twitterImage} />}
            <meta
                key="robots"
                name="robots"
                content={`${meta.robots.index ? 'index' : 'noindex'},${meta.robots.follow ? 'follow' : 'nofollow'}`}
            />
            {structuredData && (
                <script
                    key="ld-json"
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
                />
            )}
        </Head>
    );
}

/** The SEO surface bound to one site, so pages pass only what is theirs. */
export function createSeo(site: SiteSeo) {
    function BoundSeo(props: Omit<SeoProps, 'site'>): ReactElement {
        return <Seo site={site} {...props} />;
    }
    return {
        site,
        Seo: BoundSeo,
        generateMetaTags: (page?: PageSeo) => generateMetaTags(site, page),
        webSite: (opts?: { search?: string }): JsonLdNode => webSite(site, opts),
        organization,
        softwareApplication: (opts: Parameters<typeof softwareApplication>[1]): JsonLdNode =>
            softwareApplication(site, opts),
        techArticle: (opts?: Parameters<typeof techArticle>[1]): JsonLdNode => techArticle(site, opts),
        webPage: (opts?: Parameters<typeof webPage>[1]): JsonLdNode => webPage(site, opts),
    };
}
