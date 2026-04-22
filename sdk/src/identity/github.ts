/**
 * GitHub Identity Verification
 * Verifies that a user controls a GitHub identity by checking for gists
 */

import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/github');

/**
 * Gist file bodies are fetched from `raw_url`. GitHub serves these from
 * `gist.githubusercontent.com`, but `raw_url` is *server-controlled* — a
 * malicious response could point it anywhere (internal IPs, 169.254.169.254,
 * file://, etc.) and our verifier would happily fetch it. Allow-list the
 * expected host to close the SSRF door.
 */
const GITHUB_GIST_RAW_HOST = 'gist.githubusercontent.com';

/** Cap fan-out so a user with 1k gists × many files can't pin the verifier. */
const MAX_GISTS_SCANNED = 30;
const MAX_FILES_PER_GIST = 10;

/** Tight per-request deadline. Github is usually under 300ms. */
const FETCH_TIMEOUT_MS = 5_000;

/** Reject usernames that don't match GitHub's published allowed character set
 * before we interpolate them into a URL. */
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

function isSafeGistRawUrl(raw: string): boolean {
    try {
        const u = new URL(raw);
        return u.protocol === 'https:' && u.hostname === GITHUB_GIST_RAW_HOST;
    } catch {
        return false;
    }
}

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

    if (!GITHUB_USERNAME_RE.test(username)) {
        return { verified: false, error: 'invalid GitHub username format' };
    }

    try {
        // Query GitHub API for user's gists
        const response = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}/gists?per_page=${MAX_GISTS_SCANNED}`,
            {
                headers: { Accept: 'application/vnd.github.v3+json' },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            }
        );

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

        const gists = (await response.json()) as GitHubGist[];

        log.info({ username, gistCount: gists.length }, 'Fetched GitHub gists');

        // Check each gist for attestation ID (capped fan-out)
        for (const gist of gists.slice(0, MAX_GISTS_SCANNED)) {
            // Check gist description
            if (gist.description?.includes(attestationId)) {
                log.info({ username, gistId: gist.id }, 'Found attestation ID in gist description');
                return {
                    verified: true,
                    gistUrl: gist.html_url,
                    gistId: gist.id,
                };
            }

            // Check each file in the gist (capped)
            const files = Object.entries(gist.files).slice(0, MAX_FILES_PER_GIST);
            for (const [filename, file] of files) {
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

                // If content not available, fetch it from raw_url — but only
                // if raw_url is a real GitHub-hosted URL. Without the allow-list
                // we're an SSRF primitive for anyone controlling the API
                // response (including via a compromised GitHub mirror / MITM).
                if (!isSafeGistRawUrl(file.raw_url)) {
                    log.warn(
                        { filename, rawUrl: file.raw_url },
                        'skipping gist file: raw_url failed allow-list'
                    );
                    continue;
                }

                try {
                    const fileResponse = await fetch(file.raw_url, {
                        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                    });
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
