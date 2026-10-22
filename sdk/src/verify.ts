/**
 * OrangeCheck Protocol Verification
 *
 * Core verification logic for BIP-322 and legacy signatures,
 * UTXO analysis, and reputation metrics computation
 */

import type { ScoringAlgorithm } from './scoring';
import type {
    IdentityBinding,
    Metrics,
    Network,
    Scheme,
    StatusCode,
    VerifyInput,
    VerifyOptions,
    VerifyOutcome,
} from './types';

import { verifySignature as verifyBitcoinSignature } from '@orangecheck/bip322';

import { generateAttestationId, parseIdentities } from './canonical';
import { computeAllScores, computeScore } from './scoring';
import { createLogger } from './utils/logger';
import { signatureScheme, toBase64Maybe } from './utils/signature';
import { rfc3339Ms } from './utils/time';

const log = createLogger('ocp/verify');

/**
 * Scoring function per OCP v0 specification (SPEC.md §6)
 * Formula: score = round( ln(1 + sats_bonded) * (1 + days_unspent / 30), 2 )
 *
 * This produces an unbounded score that combines both sats and time.
 * Typical ranges:
 * - 10k sats, 30 days ≈ 18
 * - 100k sats, 90 days ≈ 46
 * - 1M sats, 365 days ≈ 182
 * - 100M sats, 365 days ≈ 243
 */
/**
 * Export scoring functions for use in other modules
 */
export { computeScore, computeAllScores, type ScoringAlgorithm };

/**
 * Input for signature verification
 */
interface SignatureVerifyInput {
    /** Bitcoin address */
    addr: string;
    /** Message to verify */
    msg: string;
    /** Signature (hex or base64) */
    sig: string;
    /** @deprecated Ignored: the signature's own bytes decide the scheme. */
    scheme?: Scheme;
}

/**
 * Verify a signature and name the scheme that verified it. The scheme comes
 * from the signature's bytes (see `signatureScheme`), never from the address
 * or a caller's hint, so a valid BIP-137 signature verifies on every address
 * it can stand for, whatever its recovery id.
 */
async function verifySignature({ addr, msg, sig }: SignatureVerifyInput): Promise<StatusCode> {
    const sigBase64 = toBase64Maybe(sig);
    const scheme = signatureScheme(sigBase64);
    if (!scheme) return 'sig_unsupported_script';

    const ok = verifyBitcoinSignature(addr, msg, sigBase64);
    log.info({ addr, ok, scheme, msgLength: msg.length }, 'Signature verification result');
    if (!ok) return 'sig_invalid';
    return scheme === 'legacy' ? 'sig_ok_legacy' : 'sig_ok_bip322';
}

/** True when `sig` is a valid signature by `addr` over `msg`; no chain lookup. */
export async function signatureIsValid(input: SignatureVerifyInput): Promise<boolean> {
    try {
        const code = await verifySignature(input);
        return code === 'sig_ok_bip322' || code === 'sig_ok_legacy';
    } catch {
        return false;
    }
}

// Canonical message parsing per SPEC + our builder (lowercase keys, extensions)
export function parseCanonicalMessage(msg: string) {
    const lines = msg.split('\n').map((l) => l.trim());
    // `.split(':', 2)[1]` truncates values containing a colon (e.g. URLs in
    // extensions, or npubs in identities). Use the first colon as the
    // separator and keep everything after it — same approach as the
    // extensions loop below.
    const getVal = (prefix: string): string | undefined => {
        const needle = prefix + ':';
        const hit = lines.find((l) => l.toLowerCase().startsWith(needle));
        if (!hit) return undefined;
        const idx = hit.indexOf(':');
        return hit.slice(idx + 1).trim();
    };

    const address = getVal('address') || '';
    const identitiesStr = getVal('identities') || '';
    const issued_at = getVal('issued_at') || '';
    // Present but empty is kept as '', so a reader can refuse it rather than skip it.
    const expires = getVal('expires');

    // Parse identities
    let identities: IdentityBinding[] = [];
    try {
        identities = parseIdentities(identitiesStr);
    } catch (err) {
        log.warn({ identitiesStr, error: err }, 'Failed to parse identities field');
    }

    // Extensions: collect all key: value pairs excluding core known keys
    const coreKeys = new Set([
        'orangecheck',
        'identities',
        'address',
        'purpose',
        'nonce',
        'issued_at',
        'ack',
    ]);
    const extensions: Record<string, string> = {};
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 1).trim();
        if (!coreKeys.has(key) && val) extensions[key] = val;
    }

    const network = (extensions['network'] || 'mainnet') as Network;

    // Parse bond extension if present (integer satoshis)
    const bondStr = extensions['bond'];
    const bond = bondStr ? parseInt(bondStr, 10) : undefined;

    return {
        core: { address, identities, issued_at },
        expires,
        network,
        extensions,
        bond: bond !== undefined && !isNaN(bond) && bond > 0 ? bond : undefined,
    };
}

/**
 * UTXO type from Esplora API
 */
interface EsploraUtxo {
    /** Transaction ID */
    txid: string;
    /** Output index */
    vout: number;
    /** Value in satoshis */
    value: number;
    /** Confirmation status */
    status: {
        /** Whether UTXO is confirmed */
        confirmed: boolean;
        /** Block height (if confirmed) */
        block_height?: number;
        /** Block timestamp (if confirmed) */
        block_time?: number;
    };
}

/**
 * Fetch UTXOs for an address from Esplora API
 *
 * Tries multiple endpoints in order with automatic fallback
 *
 * @param address - Bitcoin address
 * @param network - Bitcoin network
 * @param opts - Optional custom Esplora endpoints
 * @returns Array of UTXOs
 * @throws {Error} If all endpoints fail
 */
async function getAddressUtxos(
    address: string,
    network: Network,
    opts?: {
        esploraMainnetBase?: string;
        esploraSignetBase?: string;
        esploraTestnetBase?: string;
    }
): Promise<EsploraUtxo[]> {
    // Define primary and fallback endpoints
    const endpoints =
        network === 'signet'
            ? [
                  opts?.esploraSignetBase || 'https://mempool.space/signet/api',
                  'https://blockstream.info/signet/api',
              ]
            : network === 'testnet'
              ? [
                    opts?.esploraTestnetBase || 'https://mempool.space/testnet/api',
                    'https://blockstream.info/testnet/api',
                ]
              : [
                    opts?.esploraMainnetBase || 'https://mempool.space/api',
                    'https://blockstream.info/api',
                ];

    let lastError: Error | null = null;

    // Try each endpoint in order. Per-endpoint timeout kept tight (5s) so
    // a slow upstream doesn't stack against the next one; callers who want
    // a hard overall deadline should wrap this call with their own timeout.
    for (const base of endpoints) {
        try {
            const url = `${base}/address/${address}/utxo`;
            log.debug({ url, network }, 'Fetching UTXOs');

            const resp = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(5000),
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();

            // Validate response structure
            if (!Array.isArray(data)) {
                throw new Error('Invalid response: expected array');
            }

            // Validate each UTXO has required fields
            for (const utxo of data) {
                if (
                    typeof utxo.value !== 'number' ||
                    typeof utxo.status !== 'object' ||
                    typeof utxo.status.confirmed !== 'boolean' ||
                    typeof utxo.txid !== 'string' ||
                    typeof utxo.vout !== 'number'
                ) {
                    throw new Error('Invalid UTXO structure');
                }
            }

            log.info({ base, count: data.length, network }, 'UTXOs fetched successfully');
            return data as EsploraUtxo[];
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            log.warn(
                { base, error: lastError.message, network },
                'Esplora endpoint failed, trying next'
            );
        }
    }

    // All endpoints failed
    log.error({ endpoints, error: lastError?.message, network }, 'All Esplora endpoints failed');
    throw new Error(`esplora_all_failed: ${lastError?.message || 'unknown'}`);
}

/**
 * Enhanced metrics computation per SPEC.md §5.4 and §6.1
 *
 * Supports bond extension with oldest-first greedy UTXO selection
 *
 * @param utxos - Array of UTXOs from Esplora
 * @param bondAmount - Optional bond amount (enables greedy selection)
 * @returns Computed metrics (sats_bonded, days_unspent, confirmed_balance)
 */
function computeMetrics(
    utxos: EsploraUtxo[],
    bondAmount?: number,
    coverSats?: number
): {
    /** Bonded satoshis (confirmed balance or bond amount) */
    sats_bonded: number;
    /** Days since oldest/youngest UTXO */
    days_unspent: number;
    /** Total confirmed balance */
    confirmed_balance: number;
} {
    // Filter out unconfirmed UTXOs
    const confirmedUtxos = utxos.filter((u) => u.status.confirmed);
    if (confirmedUtxos.length === 0) {
        return { sats_bonded: 0, days_unspent: 0, confirmed_balance: 0 };
    }

    // Compute total confirmed balance
    const confirmed_balance = confirmedUtxos.reduce((sum, u) => sum + u.value, 0);

    // If bond extension is present, use oldest-first greedy algorithm
    if (bondAmount !== undefined && bondAmount > 0) {
        // Sort UTXOs by (block_height ASC, txid ASC, vout ASC) - oldest first
        const sorted = [...confirmedUtxos].sort((a, b) => {
            const heightA = a.status.block_height ?? Infinity;
            const heightB = b.status.block_height ?? Infinity;
            if (heightA !== heightB) return heightA - heightB;
            if (a.txid !== b.txid) return a.txid.localeCompare(b.txid);
            return a.vout - b.vout;
        });

        // Greedily select UTXOs until sum >= bond
        let sum = 0;
        let youngestTime = 0;
        for (const utxo of sorted) {
            sum += utxo.value;
            youngestTime = Math.max(youngestTime, utxo.status.block_time || 0);
            if (sum >= bondAmount) break;
        }

        // Age is computed from the youngest UTXO in the bonded set
        const days_unspent = Math.max(
            0,
            Math.floor((Date.now() / 1000 - youngestTime) / (24 * 60 * 60))
        );

        return {
            sats_bonded: bondAmount, // Use exactly bond amount (ignore surplus)
            days_unspent,
            confirmed_balance,
        };
    }

    // Default behavior (no bond extension): sum all confirmed UTXOs
    const sats_bonded = confirmed_balance;

    // A checker asking for an amount gets the age of the coins that make it
    // up, oldest first, not the age of whichever coin is oldest.
    if (coverSats !== undefined && coverSats > 0) {
        const sorted = [...confirmedUtxos].sort(
            (a, b) => (a.status.block_height ?? Infinity) - (b.status.block_height ?? Infinity)
        );
        let sum = 0;
        let youngestTime = 0;
        for (const utxo of sorted) {
            sum += utxo.value;
            youngestTime = Math.max(youngestTime, utxo.status.block_time || Date.now() / 1000);
            if (sum >= coverSats) break;
        }
        const days_unspent = Math.max(
            0,
            Math.floor((Date.now() / 1000 - youngestTime) / (24 * 60 * 60))
        );
        return { sats_bonded, days_unspent, confirmed_balance };
    }

    // Find the oldest confirmed UTXO for days_unspent
    const oldestTime = Math.min(
        ...confirmedUtxos.map((u) => u.status.block_time || Date.now() / 1000)
    );
    const days_unspent = Math.max(0, Math.floor((Date.now() / 1000 - oldestTime) / (24 * 60 * 60)));

    return { sats_bonded, days_unspent, confirmed_balance };
}

/**
 * Verify an OrangeCheck attestation
 *
 * This is the main verification function that:
 * 1. Validates the canonical message format
 * 2. Verifies the Bitcoin signature (BIP-322 or legacy)
 * 3. Fetches and analyzes UTXOs
 * 4. Computes reputation metrics
 *
 * @param input - Verification input (message, address, signature)
 * @param opts - Optional verification options (test mode, audience, esplora bases)
 * @returns Verification outcome with status codes and metrics
 *
 * @example
 * ```typescript
 * const result = await verify({
 *   msg: canonicalMessage,
 *   addr: 'bc1q...',
 *   sig: 'AkcwRAIg...',
 * });
 *
 * if (result.ok) {
 *   console.log('Score:', result.metrics?.score);
 * }
 * ```
 */
export async function verify(input: VerifyInput, opts: VerifyOptions = {}): Promise<VerifyOutcome> {
    const codes: StatusCode[] = [];
    let network: Network = 'mainnet';

    try {
        // Check if we have required fields
        if (!input.msg || !input.addr || !input.sig) {
            codes.push('bad_request');
            return { ok: false, codes, network };
        }

        // Parse canonical message with extensions
        const parsed = parseCanonicalMessage(input.msg);
        network = parsed.network || 'mainnet';

        // Compute attestation ID
        const attestation_id = await generateAttestationId(input.msg);

        // Validate address consistency
        if (parsed.core.address !== input.addr) {
            codes.push('bad_request');
            return { ok: false, codes, network, attestation_id };
        }

        // Testnet/Signet policy enforcement
        if ((network === 'testnet' || network === 'signet') && !opts.testMode) {
            codes.push('network_testmode');
            return { ok: false, codes, network, attestation_id };
        }

        // Optional policy checks for extensions.
        // `aud` binds the attestation to an origin. If the caller passed
        // `expectedAud`, the check must be load-bearing — a mismatch is a
        // phishing signal, not an advisory. Fail hard (spec-aligned).
        if (opts.expectedAud) {
            const aud = parsed.extensions['aud'];
            if (!aud || aud !== opts.expectedAud) {
                codes.push('aud_mismatch');
                return { ok: false, codes, network, attestation_id };
            }
        }

        // Check message expiration. An expiry that is not an RFC 3339 time is
        // refused as expired: nothing shows it lies ahead.
        if (parsed.expires !== undefined) {
            const exp = rfc3339Ms(parsed.expires);
            if (exp === null || exp < Date.now()) {
                codes.push('expired');
                return { ok: false, codes, network, attestation_id };
            }
        }

        // Enhanced signature verification
        const sigCode = await verifySignature({
            addr: input.addr,
            msg: input.msg,
            sig: input.sig,
            ...(input.scheme && { scheme: input.scheme }),
        });
        codes.push(sigCode);

        const sigOk = sigCode === 'sig_ok_bip322' || sigCode === 'sig_ok_legacy';
        if (!sigOk) {
            return {
                ok: false,
                codes,
                network,
                attestation_id,
                identities: parsed.core.identities,
            };
        }

        // Enhanced UTXO analysis and metrics computation
        try {
            const utxos = await getAddressUtxos(input.addr, network, {
                esploraMainnetBase: opts.esploraMainnetBase,
                esploraSignetBase: opts.esploraSignetBase,
            });

            // Compute metrics with bond extension support (SPEC.md §5.4)
            const { sats_bonded, days_unspent, confirmed_balance } = computeMetrics(
                utxos,
                parsed.bond,
                opts.coverSats
            );

            // If bond extension is present, enforce minimum balance (SPEC.md §5.4.c)
            if (parsed.bond !== undefined && parsed.bond > 0) {
                if (confirmed_balance < parsed.bond) {
                    codes.push('bond_insufficient');
                    log.warn(
                        {
                            bond: parsed.bond,
                            confirmed_balance,
                            address: input.addr,
                        },
                        'Bond extension: insufficient balance'
                    );
                    return {
                        ok: false,
                        codes,
                        network,
                        attestation_id,
                        identities: parsed.core.identities,
                    };
                }
            }

            // Analyze bond status
            if (sats_bonded <= 0) {
                codes.push('bond_zero');
                // Check for pending UTXOs
                if (utxos.some((u) => !u.status.confirmed)) {
                    codes.push('bond_pending');
                }
                return {
                    ok: false,
                    codes,
                    network,
                    attestation_id,
                    identities: parsed.core.identities,
                };
            } else {
                codes.push('bond_confirmed');
            }

            // Compute final metrics with enhanced scoring
            const metrics: Metrics = {
                sats_bonded,
                days_unspent,
                score: (computeScore(sats_bonded, days_unspent, { algorithm: 'v0' }) as number),
            };

            return {
                ok: true,
                codes,
                network,
                attestation_id,
                identities: parsed.core.identities,
                metrics,
            };
        } catch (utxoError) {
            log.error({ err: utxoError }, 'UTXO fetch failed');
            codes.push('bad_request');
            return { ok: false, codes, network, attestation_id };
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e ?? 'decode_error');
        if (msg === 'decode_error') {
            codes.push('decode_error');
        } else {
            codes.push('bad_request');
        }
        return { ok: false, codes, network };
    }
}
