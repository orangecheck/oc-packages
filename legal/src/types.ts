/**
 * @orangecheck/legal — type model
 *
 * A legal document is structured DATA, not JSX. Content is authored once as
 * `Section`/`Block` objects with `[[TOKEN]]` placeholders; `buildDoc()`
 * interpolates per-site tokens and the render components turn data into JSX.
 * This is what lets the family keep one source of truth and still let each
 * commercial product diverge where it genuinely must.
 */

/** A legal posture. One profile may serve several sites (see `protocol`). */
export type LegalProfile = 'protocol' | 'me' | 'vault' | 'fleet';

/**
 * The composable document kinds. Security pages are intentionally NOT
 * composed here — they are short, product-specific trust documents kept
 * bespoke per site, sharing only the `<SecurityDisclosure>` component.
 */
export type DocKind = 'terms' | 'privacy';

/** A bullet is either a plain line or a key/value definition row. */
export type BulletItem = string | { k: string; v: string };

/**
 * A content block. Strings support a minimal inline markup understood by the
 * renderer: `**bold**`, `` `code` ``, and `[label](href)` (http(s) hrefs
 * render as external anchors, everything else as a Next `<Link>`).
 */
export type Block =
    | { kind: 'para'; text: string }
    | { kind: 'subhead'; text: string }
    | { kind: 'bullets'; items: BulletItem[] }
    | { kind: 'callout'; text: string; emphatic?: boolean }
    /**
     * A section the family has deliberately NOT finalized — money-movement,
     * custody, refund, SLA, and regulated-activity clauses for the commercial
     * products. Renders as a visible "pending counsel review" notice so it is
     * honest to users and unmissable to whoever finalizes it.
     */
    | { kind: 'stub'; text: string };

/** One numbered section of a document. */
export interface Section {
    /** Stable slug — used for cross-references and per-site overrides. */
    id: string;
    /** Zero-padded number; assigned by `buildDoc` from section order. */
    num?: string;
    heading: string;
    /** Optional `// hint` shown beside the heading. */
    hint?: string;
    blocks: Block[];
}

/** A profile's definition of one document, before token interpolation. */
export interface DocSpec {
    kind: DocKind;
    eyebrow: string;
    title: string;
    description: string;
    metaTitle: string;
    metaDescription: string;
    /** ISO date the document first took effect. */
    effective: string;
    /** ISO date of the most recent revision. */
    updated: string;
    /** Blocks rendered above section [01] (scope notices, acceptance callout). */
    preamble?: Block[];
    sections: Section[];
    /** The trailing one-line `// summary:` note. */
    summary?: string;
}

/** A fully resolved document — tokens interpolated, sections numbered. */
export interface LegalDoc extends DocSpec {
    site: string;
    profile: LegalProfile;
}

/** Per-site context. Several sites may share a profile but differ in tokens. */
export interface SiteContext {
    slug: string;
    profile: LegalProfile;
    /** Apex host, e.g. `me.ochk.io`. */
    host: string;
    /** Human product name — resolves `[[PRODUCT]]`. */
    product: string;
    /** Short product name — resolves `[[PRODUCT_SHORT]]`. */
    productShort: string;
    /** General contact — resolves `[[CONTACT]]`. */
    contact: string;
    /** Security contact — resolves `[[SECURITY_CONTACT]]`. */
    securityContact: string;
    /** True when this site hosts its own legal pages (vs. linking to ochk.io). */
    selfHosted: boolean;
}
