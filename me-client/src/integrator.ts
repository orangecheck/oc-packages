/**
 * @orangecheck/me-client/integrator
 *
 * Pure-JS subset of the SDK for non-browser environments (CLI tools,
 * scripts, server-side validators). No React, no `window`, no DOM.
 * Just the integrator-config taxonomy + helpers.
 *
 *   import {
 *     ARCHETYPE_TEMPLATES,
 *     configFromTemplate,
 *     validateIntegratorConfig,
 *     EVENT_SUBTYPES,
 *   } from '@orangecheck/me-client/integrator';
 *
 * Use this instead of the main entry point in any context where
 * pulling React via the SignInButton tree-shake is a problem (e.g.
 * shell scripts, CI lints, the @orangecheck/cli package).
 */

export {
    PLATFORM_FEE_POLICY,
    MIN_INTEGRATOR_PRICE_SATS,
    computeFees,
    validateIntegratorConfig,
} from './types';

export type {
    EventClass,
    EventSubtype,
    ClassASubtype,
    ClassBSubtype,
    ClassCSubtype,
    AttestTier,
    SiteFeeShape,
    IntegratorEventConfig,
    IntegratorPriceConfig,
    ComputedFees,
    ValidationResult,
    BillableEvent,
    WebhookPayload,
    WebhookHeaders,
} from './types';

export {
    EVENT_SUBTYPES,
    ALL_EVENT_SUBTYPES,
    subtypesForClass,
    type EventSubtypeMetadata,
} from './subtypes';

export {
    ARCHETYPE_TEMPLATES,
    fromTemplate as configFromTemplate,
    getArchetypeTemplate,
    type ArchetypeTemplate,
    type IntegratorArchetype,
} from './templates';
