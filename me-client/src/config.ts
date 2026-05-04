/**
 * `oc.config.validate` — local IntegratorPriceConfig validator, no
 * network call. Mirrors the server-side validation rules the
 * configurator at me.ochk.io/integrate enforces.
 *
 *   import { oc } from '@orangecheck/me-client';
 *   import type { IntegratorPriceConfig } from '@orangecheck/me-client';
 *
 *   const cfg: IntegratorPriceConfig = { … };
 *   const result = oc.config.validate(cfg);
 *   if (!result.ok) console.error(result.errors);
 *
 * Per-project read/write of the config is owner-gated and lives at
 * /api/me/projects/[id] (POST to update). See me.ochk.io/me/projects/
 * for the operator UI.
 */

import { validateIntegratorConfig } from './types';
import type { IntegratorPriceConfig, ValidationResult } from './types';

function validate(cfg: IntegratorPriceConfig): ValidationResult {
    return validateIntegratorConfig(cfg);
}

export const config = { validate };
