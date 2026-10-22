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
import { DEFAULT_RELAYS, signedEnvelope } from './nostr';
import { nostrPubkeyToHex } from './nostr-pubkey';
import { ISSUED_AHEAD_MS, rfc3339Ms } from './utils/time';
import { parseCanonicalMessage, signatureIsValid, verify } from './verify';


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

    let found: AttestationEnvelope[] = [];
    if (id) {
        found = await discoverAttestations({ attestationId: id, relays });
    } else if (addr) {
        found = await getAttestationsForAddress(addr, relays);
    } else if (identity) {
        found = await getAttestationsForIdentity(identity.protocol, identity.identifier, relays);
    }

    // Every field used, ordered by or returned comes from the signed message.
    // Relays match on unsigned tags, so keep only envelopes whose message says
    // what was asked; one dated ahead of now is not valid yet.
    const latest = Date.now() + ISSUED_AHEAD_MS;
    const envelopes = found
        .map(signedEnvelope)
        .filter((e): e is AttestationEnvelope => e !== null)
        .filter((e) => signedMatch(e, { addr, id, identity }))
        .map((e) => ({ e, at: rfc3339Ms(e.issued_at)! }))
        .filter(({ at }) => at <= latest)
        // Newest signed issued_at first; the id breaks a tie the same way everywhere.
        .sort((a, b) => b.at - a.at || (a.e.attestation_id < b.e.attestation_id ? -1 : 1))
        .map(({ e }) => e);
    if (envelopes.length === 0) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['not_found'] };
    }

    // The newest whose signature holds (SPEC §7.2).
    let env = envelopes[0]!;
    for (const candidate of envelopes) {
        if (await signedBy(candidate)) {
            env = candidate;
            break;
        }
    }

    // SECURITY.md §3: one address, one bond. An address that also backs a
    // different identity on the same protocol is lending one stake to several.
    const shared = identity ? await backsOtherIdentity(env, identity, relays) : false;

    const outcome = await verify(
        {
            addr: env.address,
            msg: env.message,
            sig: env.signature,
            scheme: env.scheme,
        },
        { ...verifyOptions, coverSats: minSats > 0 ? minSats : undefined }
    );

    const sats = outcome.metrics?.sats_bonded ?? 0;
    const days = outcome.metrics?.days_unspent ?? 0;
    const score = outcome.metrics?.score ?? 0;

    const reasons: string[] = [];
    if (!outcome.ok) reasons.push(...outcome.codes);
    if (shared) reasons.push('stake_shared');
    if (sats < minSats) reasons.push('below_min_sats');
    if (days < minDays) reasons.push('below_min_days');

    const ok = outcome.ok && !shared && sats >= minSats && days >= minDays;

    return {
        ok,
        sats,
        days,
        score,
        attestation_id: env.attestation_id,
        address: env.address,
        identities: signedIdentities(env),
        network: outcome.network,
        ...(reasons.length ? { reasons } : {}),
    };
}

type Identity = { protocol: string; identifier: string };

function identityKey(b: Identity): string | null {
    const protocol = b.protocol.trim().toLowerCase();
    if (protocol === 'nostr') {
        const hex = nostrPubkeyToHex(b.identifier);
        return hex ? `nostr:${hex}` : null;
    }
    return `${protocol}:${b.identifier.trim()}`;
}

function signedIdentities(env: AttestationEnvelope): Identity[] {
    try {
        return parseCanonicalMessage(env.message).core.identities;
    } catch {
        return [];
    }
}

function signedMatch(
    env: AttestationEnvelope,
    q: { addr?: string; id?: string; identity?: Identity }
): boolean {
    if (q.id) return env.attestation_id.toLowerCase() === q.id.trim().toLowerCase();
    let signedAddress: string;
    try {
        signedAddress = parseCanonicalMessage(env.message).core.address;
    } catch {
        return false;
    }
    if (signedAddress !== env.address) return false;
    if (q.addr) return signedAddress === q.addr;
    if (q.identity) {
        const want = identityKey(q.identity);
        return want !== null && signedIdentities(env).some((b) => identityKey(b) === want);
    }
    return false;
}

function signedBy(e: AttestationEnvelope): Promise<boolean> {
    return signatureIsValid({ addr: e.address, msg: e.message, sig: e.signature, scheme: e.scheme });
}

async function backsOtherIdentity(
    env: AttestationEnvelope,
    identity: Identity,
    relays: string[]
): Promise<boolean> {
    const want = identityKey(identity);
    const protocol = identity.protocol.trim().toLowerCase();
    const siblings = await getAttestationsForAddress(env.address, relays);
    for (const e of [env, ...siblings]) {
        if (!signedMatch(e, { addr: env.address })) continue;
        const other = signedIdentities(e).some(
            (b) => b.protocol.trim().toLowerCase() === protocol && identityKey(b) !== want
        );
        // Only the address's own signature can lend its stake to another identity.
        if (other && (e === env || (await signedBy(e)))) return true;
    }
    return false;
}
