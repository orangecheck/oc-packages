/**
 * @orangecheck/legal
 *
 * Family-internal legal-document engine for the .ochk.io sub-sites. Composes
 * Terms and Privacy pages from a shared core clause library plus per-profile
 * content, with `[[TOKEN]]` interpolation so one source of truth serves the
 * whole family. Security pages stay bespoke per product; they share only the
 * `<SecurityDisclosure>` block.
 *
 * Not for third-party integration.
 *
 * Usage in a site page:
 *
 *   import { buildDoc, LegalDocument } from '@orangecheck/legal';
 *   const doc = buildDoc('me', 'terms');
 *   // <LegalDocument doc={doc} /> inside the site's own <Seo> + container
 */

export { buildDoc } from './build';
export { LegalDocument } from './components';
export type { LegalDocumentProps } from './components';
export { SecurityDisclosure } from './security';
export type { SecurityDisclosureProps } from './security';

export {
    LEGAL_SITES,
    PROTOCOL_LINKED_SITES,
    getSiteContext,
    legalHref,
} from './registry';

export {
    LEGAL_ENTITY,
    LEGAL_ENTITY_LONG,
    ENTITY_PENDING,
    CONTACT_GENERAL,
    CONTACT_SECURITY,
    CONTACT_PRIVACY,
} from './constants';

export type {
    Block,
    BulletItem,
    DocKind,
    DocSpec,
    LegalDoc,
    LegalProfile,
    Section,
    SiteContext,
} from './types';
