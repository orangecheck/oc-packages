/**
 * Twitter Identity Verification
 * Verifies that a user controls a Twitter identity
 *
 * Note: Twitter API requires authentication and has rate limits.
 * This implementation uses manual verification where the user provides a tweet URL.
 */

import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/twitter');

/**
 * Verification result for Twitter identity
 */
export interface TwitterVerificationResult {
    verified: boolean;
    tweetUrl?: string;
    tweetId?: string;
    error?: string;
}

/**
 * Verify Twitter identity via manual tweet URL
 *
 * @param attestationId - The attestation ID to look for
 * @param handle - The Twitter handle (with or without @)
 * @param tweetUrl - Optional tweet URL provided by user
 * @returns Verification result
 */
export async function verifyTwitterIdentity(
    attestationId: string,
    handle: string,
    tweetUrl?: string
): Promise<TwitterVerificationResult> {
    log.info({ attestationId, handle, tweetUrl }, 'Verifying Twitter identity');

    if (!tweetUrl) {
        return {
            verified: false,
            error: 'Tweet URL required for verification',
        };
    }

    try {
        // Extract tweet ID from URL
        const tweetId = extractTweetId(tweetUrl);

        if (!tweetId) {
            return {
                verified: false,
                error: 'Invalid tweet URL format',
            };
        }

        // For now, we can't verify without Twitter API access
        // Return instructions for manual verification
        log.info({ handle, tweetId }, 'Manual verification required');

        return {
            verified: false,
            tweetUrl,
            tweetId,
            error: 'Automatic verification not available. Please verify manually by checking the tweet.',
        };
    } catch (err) {
        log.error({ error: err, handle }, 'Failed to verify Twitter identity');
        return {
            verified: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

/**
 * Extract tweet ID from various Twitter URL formats
 */
function extractTweetId(url: string): string | null {
    // Support various Twitter URL formats:
    // https://twitter.com/username/status/1234567890
    // https://x.com/username/status/1234567890
    // https://mobile.twitter.com/username/status/1234567890

    const patterns = [
        /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
        /(?:mobile\.twitter\.com)\/\w+\/status\/(\d+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Get verification instructions for Twitter identity
 */
export function getTwitterVerificationInstructions(attestationId: string, handle: string): string {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    return `To verify your Twitter identity (@${cleanHandle}):

1. Go to https://twitter.com/compose/tweet
2. Post a tweet with this text:

   Verifying my OrangeCheck attestation: ${attestationId}

3. After posting, copy the tweet URL
4. Paste the URL below and click "Verify"

Example tweet URL:
https://twitter.com/${cleanHandle}/status/1234567890

The verification will check that the tweet exists and contains the attestation ID.`;
}

/**
 * Generate tweet text for verification
 */
export function generateTweetText(attestationId: string): string {
    return `Verifying my OrangeCheck attestation: ${attestationId}

Proving Bitcoin reputation with cryptographic signatures.

#OrangeCheck #Bitcoin`;
}

/**
 * Get direct link to compose a verification tweet
 */
export function getTwitterComposeUrl(attestationId: string): string {
    const text = generateTweetText(attestationId);
    const encoded = encodeURIComponent(text);

    return `https://twitter.com/intent/tweet?text=${encoded}`;
}

/**
 * Validate tweet URL format
 */
export function isValidTweetUrl(url: string): boolean {
    return extractTweetId(url) !== null;
}

/**
 * Get tweet URL from handle and tweet ID
 */
export function getTweetUrl(handle: string, tweetId: string): string {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    return `https://twitter.com/${cleanHandle}/status/${tweetId}`;
}

/**
 * Manual verification helper
 * Returns instructions for verifier to manually check the tweet
 */
export function getManualVerificationInstructions(
    attestationId: string,
    handle: string,
    tweetUrl: string
): string {
    return `Manual Verification Steps:

1. Open this tweet: ${tweetUrl}
2. Verify it's posted by @${handle}
3. Check that the tweet contains: ${attestationId}
4. Confirm the tweet is public and not deleted

If all checks pass, the identity is verified.`;
}
