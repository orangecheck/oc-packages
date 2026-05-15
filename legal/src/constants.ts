/**
 * @orangecheck/legal — family-wide constants.
 *
 * These resolve `[[TOKEN]]` placeholders in authored content. Changing a value
 * here updates every generated document on every site at the next package
 * version bump — that is the whole point of the engine.
 */

/**
 * The entity of record.
 *
 * ── PENDING INCORPORATION ──────────────────────────────────────────────────
 * No formal entity is registered yet. Until one is, documents operate under
 * the bare name "OrangeCheck" and the Delaware-law / AAA-arbitration clauses
 * are written as forward-looking (see the dispute-resolution clause).
 *
 * When the entity is formed, change ONLY the two values below — e.g.
 *   LEGAL_ENTITY      = 'OrangeCheck, Inc.'
 *   LEGAL_ENTITY_LONG = 'OrangeCheck, Inc., a Delaware corporation'
 * — rebuild, and publish. Every Terms/Privacy page family-wide updates.
 */
export const LEGAL_ENTITY = 'OrangeCheck';
export const LEGAL_ENTITY_LONG = 'OrangeCheck (OCHK), an unincorporated project';

/** True while no formal entity exists — gates a forward-looking note. */
export const ENTITY_PENDING = true;

export const CONTACT_GENERAL = 'hello@ochk.io';
export const CONTACT_SECURITY = 'security@ochk.io';
export const CONTACT_PRIVACY = 'hello@ochk.io';

/** Governing-law surface, referenced by the shared dispute-resolution clause. */
export const GOVERNING_LAW_STATE = 'Delaware, United States';
export const ARBITRATION_SEAT = 'Wilmington, Delaware, United States';

/** Token table applied by `buildDoc`. Site-specific tokens are merged on top. */
export const GLOBAL_TOKENS: Record<string, string> = {
    ENTITY: LEGAL_ENTITY,
    ENTITY_LONG: LEGAL_ENTITY_LONG,
    CONTACT: CONTACT_GENERAL,
    SECURITY_CONTACT: CONTACT_SECURITY,
    PRIVACY_CONTACT: CONTACT_PRIVACY,
    GOVERNING_LAW: GOVERNING_LAW_STATE,
    ARBITRATION_SEAT,
};
