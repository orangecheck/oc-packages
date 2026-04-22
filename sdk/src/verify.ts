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

import { Buffer } from 'buffer';

import { Verifier } from 'bip322-js';
import * as bitcoinMessage from 'bitcoinjs-message';

import { generateAttestationId, parseIdentities } from './canonical';
import { computeAllScores, computeScore } from './scoring';
import { createLogger } from './utils/logger';

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
function scoreV0(sats: number, days: number): number {
    return computeScore(sats, days, { algorithm: 'v0' }) as number;
}

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
    /** Optional signature scheme (auto-detected if not provided) */
    scheme?: Scheme;
}

/**
 * Check if a string looks like hexadecimal
 * @param s - String to check
 * @returns True if string is valid hex with even length
 */
function looksLikeHex(s: string): boolean {
    return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

/**
 * Convert signature to base64 if it's in hex format
 * @param sig - Signature (hex or base64)
 * @returns Signature in base64 format
 */
function toBase64Maybe(sig: string): string {
    if (looksLikeHex(sig)) {
        return Buffer.from(sig, 'hex').toString('base64');
    }
    return sig;
}

/**
 * Auto-detect signature scheme based on address type and signature format
 *
 * @param addr - Bitcoin address
 * @param sig - Signature
 * @returns Detected scheme ('bip322' or 'legacy')
 */
function detectSignatureScheme(addr: string, sig: string): Scheme {
    // SegWit and Taproot addresses MUST use BIP-322
    const isSegWit = addr.startsWith('bc1') || addr.startsWith('tb1');
    if (isSegWit) {
        return 'bip322';
    }

    // For P2PKH addresses, check if signature looks like legacy format
    const sigBase64 = toBase64Maybe(sig);
    const looksLikeLegacy = sigBase64.length === 88 && /^[IHG]/.test(sigBase64);

    if (looksLikeLegacy) {
        return 'legacy';
    }

    // Default to BIP-322
    return 'bip322';
}

async function verifySignature({
    addr,
    msg,
    sig,
    scheme,
}: SignatureVerifyInput): Promise<StatusCode> {
    try {
        // Handle demo signatures - these should never reach here in demo mode,
        // but add defensive check in case demo mode flag isn't set properly
        if (sig === 'demo_signature') {
            log.warn('Demo signature detected in verifySignature - should be handled by demo mode');
            return 'sig_invalid';
        }

        // Auto-detect scheme if not explicitly provided
        const detectedScheme = scheme || detectSignatureScheme(addr, sig);

        log.debug(
            { addr, msgLength: msg.length, sigLength: sig.length, scheme: detectedScheme },
            'Verifying signature'
        );

        if (detectedScheme === 'bip322') {
            const sigBase64 = toBase64Maybe(sig);
            log.debug(
                { sigBase64: sigBase64.substring(0, 50) + '...' },
                'Signature converted to base64'
            );

            // Log the full message for debugging
            log.debug(
                {
                    msgFull: msg,
                    msgLines: msg.split('\n').length,
                    msgFirstLine: msg.split('\n')[0],
                    msgLastLine: msg.split('\n')[msg.split('\n').length - 1],
                },
                'Message being verified'
            );

            const ok = Verifier.verifySignature(addr, msg, sigBase64);
            log.info({ addr, ok }, 'BIP-322 verification result');

            if (!ok) {
                // Check if this looks like an Electrum signature (88 chars, base64)
                const isSegWit = addr.startsWith('bc1') || addr.startsWith('tb1');
                if (isSegWit && sigBase64.length === 88) {
                    log.warn(
                        { addr, wallet: 'possibly Electrum', sigLength: sigBase64.length },
                        'BIP-322 verification failed - likely Electrum wallet (does not support BIP-322 for SegWit)'
                    );
                } else {
                    log.error(
                        {
                            addr,
                            sigLength: sigBase64.length,
                            msgLength: msg.length,
                            msgPreview: msg.substring(0, 200),
                        },
                        'BIP-322 verification failed - signature does not match message'
                    );
                }
            }

            return ok ? 'sig_ok_bip322' : 'sig_invalid';
        }

        if (detectedScheme === 'legacy') {
            const sigBase64 = toBase64Maybe(sig);

            // Legacy policy: P2PKH only (address must start with '1' for mainnet or 'm'/'n' for testnet)
            if (!addr.startsWith('1') && !addr.startsWith('m') && !addr.startsWith('n')) {
                log.warn({ addr }, 'Legacy signature attempted on non-P2PKH address');
                return 'sig_unsupported_script';
            }

            log.debug(
                {
                    addr,
                    sigBase64: sigBase64.substring(0, 50) + '...',
                    msgPreview: msg.substring(0, 100) + '...',
                    msgLength: msg.length,
                },
                'Verifying legacy signature'
            );
            const ok = bitcoinMessage.verify(msg, addr, sigBase64);
            log.info({ addr, ok, sigBase64Length: sigBase64.length }, 'Legacy verification result');
            if (!ok) {
                log.error(
                    {
                        addr,
                        msgFirstLine: msg.split('\n')[0],
                        sigFormat: sigBase64.substring(0, 10),
                    },
                    'Legacy signature verification failed - check message format and signature'
                );
            }
            return ok ? 'sig_ok_legacy' : 'sig_invalid';
        }

        return 'invalid_scheme';
    } catch (err) {
        log.error(
            { addr, error: err instanceof Error ? err.message : String(err) },
            'Signature verification error'
        );
        return 'sig_invalid';
    }
}

// Canonical message parsing per SPEC + our builder (lowercase keys, extensions)
function parseCanonicalMessage(msg: string) {
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
        core: { address, identities },
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
    bondAmount?: number
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
 * @param opts - Optional verification options (demo mode, test mode, etc.)
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

        // Demo mode short-circuit with demo data matching the App panel
        if (opts.demoMode) {
            // Keep demo values in sync with createDemoBadgeData()
            const sats_bonded = 1_000_000; // 0.01 BTC
            const days_unspent = 90;
            const metrics: Metrics = {
                sats_bonded,
                days_unspent,
                score: scoreV0(sats_bonded, days_unspent), // ≈ 55.26
            };
            codes.push('sig_ok_bip322');
            codes.push('bond_confirmed');
            return {
                ok: true,
                codes,
                network,
                attestation_id,
                identities: parsed.core.identities,
                metrics,
            };
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

        // Check message expiration
        if (parsed.extensions['expires']) {
            const exp = Date.parse(parsed.extensions['expires']);
            if (!Number.isNaN(exp) && exp < Date.now()) {
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
                parsed.bond
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
                score: scoreV0(sats_bonded, days_unspent),
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
