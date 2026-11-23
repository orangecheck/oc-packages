import { ISSUER_ORIGIN_RULE, parseIssuerOrigin } from '@orangecheck/auth-core/issuer-origin';

/** `value` as one origin, by auth-core's rule, or a TypeError naming `what` (such as `revokeToken: issuer`). */
export function issuerOrigin(value: unknown, what: string): string {
    const origin = parseIssuerOrigin(value);
    if (origin === null) {
        throw new TypeError(`@orangecheck/me-client: ${what} must be ${ISSUER_ORIGIN_RULE}; got ${JSON.stringify(value)}`);
    }
    return origin;
}
