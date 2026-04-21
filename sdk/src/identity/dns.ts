/**
 * DNS Identity Verification
 * Verifies that a user controls a DNS domain
 */

import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/dns');

/**
 * Verification result for DNS identity
 */
export interface DnsVerificationResult {
    verified: boolean;
    method?: 'well-known' | 'dns-txt';
    url?: string;
    error?: string;
}

/**
 * Verify that a user controls a DNS domain
 *
 * Verification methods (in order of preference):
 * 1. Check .well-known/orangecheck.txt file
 * 2. Check DNS TXT record (requires server-side DNS lookup)
 *
 * @param attestationId - The attestation ID to look for
 * @param domain - The domain name (without protocol)
 * @returns Verification result
 */
export async function verifyDnsIdentity(
    attestationId: string,
    domain: string
): Promise<DnsVerificationResult> {
    log.info({ attestationId, domain }, 'Verifying DNS identity');

    // Clean domain (remove protocol if present)
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Try .well-known file first
    const wellKnownResult = await checkWellKnownFile(attestationId, cleanDomain);
    if (wellKnownResult.verified) {
        return wellKnownResult;
    }

    // DNS TXT record check requires server-side implementation
    // For now, return instructions
    log.info({ domain: cleanDomain }, 'Well-known file not found, DNS TXT check not implemented');

    return {
        verified: false,
        error: 'Verification file not found. Please create .well-known/orangecheck.txt',
    };
}

/**
 * Check .well-known/orangecheck.txt file
 */
async function checkWellKnownFile(
    attestationId: string,
    domain: string
): Promise<DnsVerificationResult> {
    const urls = [
        `https://${domain}/.well-known/orangecheck.txt`,
        `http://${domain}/.well-known/orangecheck.txt`, // Fallback to HTTP
    ];

    for (const url of urls) {
        try {
            log.info({ url }, 'Checking well-known file');

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'text/plain',
                },
                // Don't follow redirects to other domains
                redirect: 'manual',
            });

            if (response.ok) {
                const content = await response.text();

                if (content.includes(attestationId)) {
                    log.info({ domain, url }, 'Found attestation ID in well-known file');
                    return {
                        verified: true,
                        method: 'well-known',
                        url,
                    };
                } else {
                    log.info({ domain, url }, 'Well-known file exists but no attestation ID found');
                }
            }
        } catch (err) {
            log.warn({ error: err, url }, 'Failed to fetch well-known file');
        }
    }

    return {
        verified: false,
        error: 'Well-known file not found or does not contain attestation ID',
    };
}

/**
 * Get verification instructions for DNS identity
 */
export function getDnsVerificationInstructions(attestationId: string, domain: string): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return `To verify your DNS domain (${cleanDomain}):

**Method 1: .well-known file (Recommended)**

1. Create a file at: https://${cleanDomain}/.well-known/orangecheck.txt
2. Add this content to the file:

   OrangeCheck Attestation Verification
   Domain: ${cleanDomain}
   Attestation ID: ${attestationId}
   Timestamp: ${new Date().toISOString()}

3. Make sure the file is publicly accessible
4. Return here and click "Verify"

**Method 2: DNS TXT record (Advanced)**

1. Add a TXT record to your DNS:
   Name: _orangecheck.${cleanDomain}
   Value: ${attestationId}

2. Wait for DNS propagation (up to 24 hours)
3. Return here and click "Verify"

Note: Method 1 is faster and easier to set up.`;
}

/**
 * Generate well-known file content
 */
export function generateWellKnownContent(attestationId: string, domain: string): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return `OrangeCheck Attestation Verification
=====================================

Domain: ${cleanDomain}
Attestation ID: ${attestationId}
Timestamp: ${new Date().toISOString()}

This file verifies that the owner of ${cleanDomain} controls the Bitcoin
address associated with attestation ${attestationId}.

Learn more: https://ochk.io

---

Verification method: .well-known/orangecheck.txt
Protocol: OrangeCheck Protocol (OCP)
`;
}

/**
 * Get the expected well-known file URL
 */
export function getWellKnownUrl(domain: string): string {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${cleanDomain}/.well-known/orangecheck.txt`;
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Basic domain validation
    const domainPattern = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    return domainPattern.test(cleanDomain);
}

/**
 * Check if a DNS identity is already verified
 * This is a quick check using cached data
 */
export function isDnsIdentityVerified(
    attestationId: string,
    _domain: string,
    cachedContent?: string
): boolean {
    if (!cachedContent) {
        return false;
    }

    return cachedContent.includes(attestationId);
}
