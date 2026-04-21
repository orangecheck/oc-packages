/**
 * check()
 *
 * The high-level sybil-gate primitive. One call, one answer.
 *
 * Under the hood: find the most recent attestation for the subject via Nostr,
 * verify the signature, recompute metrics from live chain state, then compare
 * against the caller's thresholds.
 *
 * Mirrors the response shape of GET /api/check.
 */

import type { AttestationEnvelope, IdentityBinding, Network, VerifyOptions } from './types';

import {
    discoverAttestations,
    getAttestationsForAddress,
    getAttestationsForIdentity,
} from './attestation';
import { DEFAULT_RELAYS } from './nostr';
import { verify } from './verify';

export interface CheckParams {
    /** Bitcoin address to look up. */
    addr?: string;
    /** Content-addressed attestation ID (hex). */
    id?: string;
    /** Identity binding, e.g. `{ protocol: 'github', identifier: 'alice' }`. */
    identity?: { protocol: string; identifier: string };
    /** Minimum sats bonded to pass. Default 0. */
    minSats?: number;
    /** Minimum days unspent to pass. Default 0. */
    minDays?: number;
    /** Optional relay overrides for discovery. */
    relays?: string[];
    /** Optional verify-time options (esplora bases, test mode). */
    verifyOptions?: VerifyOptions;
}

export interface CheckResult {
    /** True iff signature valid AND thresholds met. */
    ok: boolean;
    /** Sats bonded on-chain for the bonded UTXO set. */
    sats: number;
    /** Days since the youngest UTXO in the bonded set was confirmed. */
    days: number;
    /** Reference `score_v0` for this attestation. */
    score: number;
    /** Attestation ID (if one was found). */
    attestation_id?: string;
    /** Bitcoin address of the attestation. */
    address?: string;
    /** Self-asserted identity bindings. Verify independently. */
    identities?: IdentityBinding[];
    /** Network the address belongs to. */
    network?: Network;
    /** Present when `ok === false`. Codes explain why. */
    reasons?: string[];
}

export async function check(params: CheckParams): Promise<CheckResult> {
    const {
        addr,
        id,
        identity,
        minSats = 0,
        minDays = 0,
        relays = DEFAULT_RELAYS,
        verifyOptions,
    } = params;

    if (!addr && !id && !identity) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['bad_request'] };
    }

    let envelopes: AttestationEnvelope[] = [];
    if (id) {
        envelopes = await discoverAttestations({ attestationId: id, relays });
    } else if (addr) {
        envelopes = await getAttestationsForAddress(addr, relays);
    } else if (identity) {
        envelopes = await getAttestationsForIdentity(
            identity.protocol,
            identity.identifier,
            relays
        );
    }

    if (envelopes.length === 0) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['not_found'] };
    }

    // Prefer most recent.
    envelopes.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    const env = envelopes[0];
    if (!env) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['not_found'] };
    }

    const outcome = await verify(
        {
            addr: env.address,
            msg: env.message,
            sig: env.signature,
            scheme: env.scheme,
        },
        verifyOptions
    );

    const sats = outcome.metrics?.sats_bonded ?? 0;
    const days = outcome.metrics?.days_unspent ?? 0;
    const score = outcome.metrics?.score ?? 0;

    const reasons: string[] = [];
    if (!outcome.ok) reasons.push(...outcome.codes);
    if (sats < minSats) reasons.push('below_min_sats');
    if (days < minDays) reasons.push('below_min_days');

    const ok = outcome.ok && sats >= minSats && days >= minDays;

    return {
        ok,
        sats,
        days,
        score,
        attestation_id: env.attestation_id,
        address: env.address,
        identities: env.identities,
        network: outcome.network,
        ...(reasons.length ? { reasons } : {}),
    };
}
