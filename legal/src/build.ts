/**
 * @orangecheck/legal — document builder.
 *
 * `buildDoc(site, kind)` is the single entry point a site page calls. It picks
 * the profile spec, interpolates `[[TOKEN]]` placeholders from global + site
 * context, numbers the sections, and returns a fully resolved `LegalDoc`. Pure
 * and synchronous, so it can run at module scope in a page file.
 */

import type { Block, BulletItem, DocKind, DocSpec, LegalDoc, Section } from './types';
import { GLOBAL_TOKENS } from './constants';
import { getSiteContext } from './registry';
import { PROFILES } from './content';

const TOKEN_RE = /\[\[([A-Z_]+)\]\]/g;

function fill(text: string, tokens: Record<string, string>): string {
    return text.replace(TOKEN_RE, (match, key: string) => tokens[key] ?? match);
}

function fillBullet(item: BulletItem, tokens: Record<string, string>): BulletItem {
    if (typeof item === 'string') return fill(item, tokens);
    return { k: fill(item.k, tokens), v: fill(item.v, tokens) };
}

function fillBlock(block: Block, tokens: Record<string, string>): Block {
    switch (block.kind) {
        case 'para':
        case 'subhead':
        case 'stub':
            return { ...block, text: fill(block.text, tokens) };
        case 'callout':
            return { ...block, text: fill(block.text, tokens) };
        case 'bullets':
            return { ...block, items: block.items.map((i) => fillBullet(i, tokens)) };
    }
}

function fillSection(section: Section, tokens: Record<string, string>, index: number): Section {
    return {
        ...section,
        num: String(index + 1).padStart(2, '0'),
        heading: fill(section.heading, tokens),
        hint: section.hint ? fill(section.hint, tokens) : undefined,
        blocks: section.blocks.map((b) => fillBlock(b, tokens)),
    };
}

function fillSpec(spec: DocSpec, tokens: Record<string, string>): DocSpec {
    return {
        ...spec,
        eyebrow: fill(spec.eyebrow, tokens),
        title: fill(spec.title, tokens),
        description: fill(spec.description, tokens),
        metaTitle: fill(spec.metaTitle, tokens),
        metaDescription: fill(spec.metaDescription, tokens),
        preamble: spec.preamble?.map((b) => fillBlock(b, tokens)),
        sections: spec.sections.map((s, i) => fillSection(s, tokens, i)),
        summary: spec.summary ? fill(spec.summary, tokens) : undefined,
    };
}

/** Build a fully resolved legal document for one site. */
export function buildDoc(siteSlug: string, kind: DocKind): LegalDoc {
    const ctx = getSiteContext(siteSlug);
    const spec = PROFILES[ctx.profile][kind];
    const tokens: Record<string, string> = {
        ...GLOBAL_TOKENS,
        PRODUCT: ctx.product,
        PRODUCT_SHORT: ctx.productShort,
        HOST: ctx.host,
        CONTACT: ctx.contact,
        SECURITY_CONTACT: ctx.securityContact,
    };
    return {
        ...fillSpec(spec, tokens),
        site: ctx.slug,
        profile: ctx.profile,
    };
}
