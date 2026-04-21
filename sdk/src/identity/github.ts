/**
 * GitHub Identity Verification
 * Verifies that a user controls a GitHub identity by checking for gists
 */

import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/github');

/**
 * Verification result for GitHub identity
 */
export interface GitHubVerificationResult {
    verified: boolean;
    gistUrl?: string;
    gistId?: string;
    error?: string;
}

/**
 * GitHub gist file structure
 */
interface GitHubGistFile {
    filename: string;
    type: string;
    language: string | null;
    raw_url: string;
    size: number;
    content?: string;
}

/**
 * GitHub gist structure
 */
interface GitHubGist {
    id: string;
    html_url: string;
    description: string;
    public: boolean;
    created_at: string;
    updated_at: string;
    files: Record<string, GitHubGistFile>;
}

/**
 * Verify that a user controls a GitHub identity
 *
 * Verification method:
 * 1. Query GitHub API for user's public gists
 * 2. Check if any gist file contains the attestation ID
 * 3. Return the gist URL as proof
 *
 * @param attestationId - The attestation ID to look for
 * @param username - The GitHub username
 * @returns Verification result with gist URL if verified
 */
export async function verifyGitHubIdentity(
    attestationId: string,
    username: string
): Promise<GitHubVerificationResult> {
    log.info({ attestationId, username }, 'Verifying GitHub identity');

    try {
        // Query GitHub API for user's gists
        const response = await fetch(`https://api.github.com/users/${username}/gists`, {
            headers: {
                Accept: 'application/vnd.github.v3+json',
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    verified: false,
                    error: `GitHub user '${username}' not found`,
                };
            }

            return {
                verified: false,
                error: `GitHub API error: ${response.status} ${response.statusText}`,
            };
        }

        const gists: GitHubGist[] = await response.json();

        log.info({ username, gistCount: gists.length }, 'Fetched GitHub gists');

        // Check each gist for attestation ID
        for (const gist of gists) {
            // Check gist description
            if (gist.description?.includes(attestationId)) {
                log.info({ username, gistId: gist.id }, 'Found attestation ID in gist description');
                return {
                    verified: true,
                    gistUrl: gist.html_url,
                    gistId: gist.id,
                };
            }

            // Check each file in the gist
            for (const [filename, file] of Object.entries(gist.files)) {
                // If content is available, check it
                if (file.content && file.content.includes(attestationId)) {
                    log.info(
                        { username, gistId: gist.id, filename },
                        'Found attestation ID in gist file'
                    );
                    return {
                        verified: true,
                        gistUrl: gist.html_url,
                        gistId: gist.id,
                    };
                }

                // If content not available, fetch it from raw_url
                try {
                    const fileResponse = await fetch(file.raw_url);
                    if (fileResponse.ok) {
                        const content = await fileResponse.text();
                        if (content.includes(attestationId)) {
                            log.info(
                                { username, gistId: gist.id, filename },
                                'Found attestation ID in gist file (fetched)'
                            );
                            return {
                                verified: true,
                                gistUrl: gist.html_url,
                                gistId: gist.id,
                            };
                        }
                    }
                } catch (err) {
                    log.warn({ error: err, filename }, 'Failed to fetch gist file content');
                }
            }
        }

        log.info({ username }, 'No verification gist found');
        return {
            verified: false,
            error: 'No gist found containing the attestation ID',
        };
    } catch (err) {
        log.error({ error: err, username }, 'Failed to verify GitHub identity');
        return {
            verified: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

/**
 * Get verification instructions for GitHub identity
 */
export function getGitHubVerificationInstructions(attestationId: string): string {
    return `To verify your GitHub identity:

1. Go to https://gist.github.com
2. Create a new public gist
3. Add a file with any name (e.g., "orangecheck.txt")
4. Paste this text into the file:

   OrangeCheck Attestation Verification
   Attestation ID: ${attestationId}

5. Click "Create public gist"
6. Return here and click "Verify" to check

The verification will search your public gists for this attestation ID.`;
}

/**
 * Generate a gist template for verification
 */
export function generateGistTemplate(attestationId: string, username: string): string {
    return `# OrangeCheck Attestation Verification

I am verifying my GitHub identity (@${username}) for OrangeCheck.

**Attestation ID:** \`${attestationId}\`

**Timestamp:** ${new Date().toISOString()}

This gist proves that I control both:
- GitHub account: @${username}
- Bitcoin address associated with attestation ${attestationId}

---

Learn more about OrangeCheck: https://ochk.io
`;
}

/**
 * Check if a GitHub identity is already verified
 * This is a quick check using cached gist data
 */
export function isGitHubIdentityVerified(
    attestationId: string,
    _username: string,
    cachedGists: GitHubGist[]
): boolean {
    return cachedGists.some((gist) => {
        // Check description
        if (gist.description?.includes(attestationId)) {
            return true;
        }

        // Check files
        return Object.values(gist.files).some((file) => file.content?.includes(attestationId));
    });
}

/**
 * Get direct link to create a verification gist. The args are accepted for
 * API parity with other identity providers but unused — GitHub doesn't accept
 * pre-fill params on the gist creation page.
 */
export function getGistCreationUrl(): string {
    return 'https://gist.github.com/';
}
