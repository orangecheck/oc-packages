import type { IdentityBinding } from '../types';
import type { DnsVerificationResult } from './dns';
import type { GitHubVerificationResult } from './github';
import type { NostrVerificationResult } from './nostr';
import type { TwitterVerificationResult } from './twitter';

import { logVerificationError } from '../utils/logger';
import { enforceRateLimit, identityVerificationLimiter } from '../utils/rate-limiter';
import { getDnsVerificationInstructions, verifyDnsIdentity } from './dns';
import { getGitHubVerificationInstructions, verifyGitHubIdentity } from './github';
import { getNostrVerificationInstructions, verifyNostrIdentity } from './nostr';
import { getTwitterVerificationInstructions, verifyTwitterIdentity } from './twitter';

/**
 * Identity Verification
 *
 * Unified API for verifying identity bindings across multiple protocols
 */

export * from './nostr';
export * from './github';
export * from './twitter';
export * from './dns';

/**
 * Unified verification result across all protocols
 */
export type VerificationResult =
    | NostrVerificationResult
    | GitHubVerificationResult
    | TwitterVerificationResult
    | DnsVerificationResult;

/**
 * Options for identity verification
 */
export interface VerifyIdentityOptions {
    /** Tweet URL for Twitter verification */
    tweetUrl?: string;
    /** Relay URLs for Nostr verification */
    relays?: string[];
}

/**
 * Verify an identity binding
 *
 * @param attestationId - The attestation ID to verify against
 * @param identity - The identity binding to verify
 * @param options - Protocol-specific verification options
 * @returns Verification result with verified status and optional error
 *
 * @example
 * ```typescript
 * const result = await verifyIdentity(
 *   'abc123...',
 *   { protocol: 'nostr', identifier: 'npub1...' },
 *   { relays: ['wss://relay.damus.io'] }
 * );
 *
 * if (result.verified) {
 *   console.log('Identity verified!');
 * }
 * ```
 */
export async function verifyIdentity(
    attestationId: string,
    identity: IdentityBinding,
    options?: VerifyIdentityOptions
): Promise<VerificationResult> {
    const { protocol, identifier } = identity;

    // Rate limiting: 5 requests per minute per identity
    const rateLimitKey = `${protocol}:${identifier}`;
    try {
        enforceRateLimit(identityVerificationLimiter, rateLimitKey);
    } catch (err) {
        return {
            verified: false,
            error: err instanceof Error ? err.message : 'Rate limit exceeded',
        };
    }

    try {
        switch (protocol) {
            case 'nostr':
                return await verifyNostrIdentity(attestationId, identifier, options?.relays);

            case 'github':
                return await verifyGitHubIdentity(attestationId, identifier);

            case 'twitter':
                return await verifyTwitterIdentity(attestationId, identifier, options?.tweetUrl);

            case 'dns':
                return await verifyDnsIdentity(attestationId, identifier);

            case 'email':
                // Email verification not implemented yet
                return {
                    verified: false,
                    error: 'Email verification not implemented',
                };

            case 'web':
                // Web verification similar to DNS
                return await verifyDnsIdentity(attestationId, identifier);

            case 'did':
                // DID verification not implemented yet
                return {
                    verified: false,
                    error: 'DID verification not implemented',
                };

            default:
                return {
                    verified: false,
                    error: `Unknown protocol: ${protocol}`,
                };
        }
    } catch (error) {
        // Log error
        logVerificationError(
            protocol,
            identifier,
            error instanceof Error ? error : new Error(String(error)),
            {
                attestationId,
            }
        );

        return {
            verified: false,
            error: error instanceof Error ? error.message : 'Verification failed',
        };
    }
}

/**
 * Get verification instructions for an identity
 */
export function getVerificationInstructions(
    attestationId: string,
    identity: IdentityBinding
): string {
    const { protocol, identifier } = identity;

    switch (protocol) {
        case 'nostr':
            return getNostrVerificationInstructions(attestationId);

        case 'github':
            return getGitHubVerificationInstructions(attestationId);

        case 'twitter':
            return getTwitterVerificationInstructions(attestationId, identifier);

        case 'dns':
            return getDnsVerificationInstructions(attestationId, identifier);

        case 'email':
            return `Email verification not implemented yet.`;

        case 'web':
            return getDnsVerificationInstructions(attestationId, identifier);

        case 'did':
            return `DID verification not implemented yet.`;

        default:
            return `Unknown protocol: ${protocol}`;
    }
}

/**
 * Check if a protocol supports automatic verification
 */
export function supportsAutomaticVerification(protocol: string): boolean {
    return ['nostr', 'github', 'dns', 'web'].includes(protocol);
}

/**
 * Check if a protocol requires manual verification
 */
export function requiresManualVerification(protocol: string): boolean {
    return ['twitter', 'email'].includes(protocol);
}

/**
 * Get verification status for multiple identities
 */
export async function verifyAllIdentities(
    attestationId: string,
    identities: IdentityBinding[],
    options?: {
        tweetUrls?: Record<string, string>; // Map of identifier -> tweet URL
        relays?: string[];
    }
): Promise<Map<string, VerificationResult>> {
    const results = new Map<string, VerificationResult>();

    await Promise.all(
        identities.map(async (identity) => {
            const key = `${identity.protocol}:${identity.identifier}`;
            const tweetUrl = options?.tweetUrls?.[identity.identifier];

            const result = await verifyIdentity(attestationId, identity, {
                tweetUrl,
                relays: options?.relays,
            });

            results.set(key, result);
        })
    );

    return results;
}

/**
 * Get summary of verification results
 */
export function getVerificationSummary(results: Map<string, VerificationResult>): {
    total: number;
    verified: number;
    failed: number;
    pending: number;
} {
    let verified = 0;
    let failed = 0;
    let pending = 0;

    for (const result of results.values()) {
        if (result.verified) {
            verified++;
        } else if (result.error?.includes('not implemented')) {
            pending++;
        } else {
            failed++;
        }
    }

    return {
        total: results.size,
        verified,
        failed,
        pending,
    };
}
