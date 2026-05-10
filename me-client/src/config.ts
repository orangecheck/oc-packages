/**
 * `oc.config` — IntegratorPriceConfig helpers.
 *
 *   oc.config.fromTemplate(useCase, identity)  · build a complete
 *      config from one of the curated archetypes ("saas-paywall",
 *      "marketplace", "content-platform", "gaming", "agent-only").
 *      Returns a type-complete config you can submit, or tweak before
 *      submitting.
 *
 *   oc.config.validate(cfg)  · local validator, no network call.
 *      Mirrors the server-side rules; run before posting to catch
 *      shape errors at edit time.
 *
 *   oc.config.archetypes  · the catalog of available templates with
 *      metadata. Useful for rendering an archetype picker in your
 *      own UI before calling fromTemplate().
 *
 * Example · zero-to-config in three lines:
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const cfg = oc.config.fromTemplate('saas-paywall', {
 *     project_key: 'pk_live_yourcompany',
 *     domain: 'yoursite.com',
 *     display_name: 'Your Site',
 *   });
 *   const result = oc.config.validate(cfg);
 *   // → submit cfg via the project upsert API
 *
 * Per-project read/write of the config is owner-gated and lives at
 * /api/me/projects/[id] (POST to update). See me.ochk.io/me/projects/
 * for the dashboard UI.
 */

import {
    ARCHETYPE_TEMPLATES,
    fromTemplate,
    getArchetypeTemplate,
    type ArchetypeTemplate,
    type IntegratorArchetype,
} from './templates';
import { validateIntegratorConfig } from './types';
import type { IntegratorPriceConfig, ValidationResult } from './types';

function validate(cfg: IntegratorPriceConfig): ValidationResult {
    return validateIntegratorConfig(cfg);
}

export const config = {
    validate,
    fromTemplate,
    /** Look up a template's metadata · for rendering "you picked X"
     *  state and offering one-click swaps in your own UI. */
    getArchetype: getArchetypeTemplate,
    /** All available archetypes · render in a picker. */
    archetypes: ARCHETYPE_TEMPLATES,
};

export type { ArchetypeTemplate, IntegratorArchetype };
