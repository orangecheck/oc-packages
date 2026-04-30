import type { IntegratorPriceConfig, ValidationResult } from './types';

import { validateIntegratorConfig } from './types';
import { api } from './transport';

/**
 * Read the integrator's currently-stored IntegratorPriceConfig from
 * me.ochk.io. The endpoint reads from the federation index in production;
 * in v1 it returns the project's last-stored config from the in-memory
 * store keyed on the authenticated project_key.
 */
async function get(): Promise<IntegratorPriceConfig> {
    return api<IntegratorPriceConfig>('/api/developer/config', { method: 'GET' });
}

/**
 * Persist a new IntegratorPriceConfig. Validates client-side first so the
 * caller gets a structured error before a round trip; the server runs the
 * same validator and rejects with 422 + a list of offending subtypes if
 * anything slipped past.
 *
 * Throws an Error containing the validation report if the config is
 * invalid client-side. Throws MeClientError on server rejection.
 */
async function update(cfg: IntegratorPriceConfig): Promise<IntegratorPriceConfig> {
    const result = validateIntegratorConfig(cfg);
    if (!result.ok) {
        const summary = result.errors
            .map((e) => (e.subtype ? `${e.subtype}: ${e.message}` : e.message))
            .join('; ');
        throw new Error(`IntegratorPriceConfig invalid · ${summary}`);
    }
    return api<IntegratorPriceConfig>('/api/developer/config', {
        method: 'POST',
        body: cfg,
    });
}

/** Run the validator without making a network call. Useful for live
 *  feedback in a dashboard form. */
function validate(cfg: IntegratorPriceConfig): ValidationResult {
    return validateIntegratorConfig(cfg);
}

export const config = { get, update, validate };
