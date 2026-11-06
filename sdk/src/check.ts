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

import { normalizeAddress } from '@orangecheck/bip322';

import { envelopesFromEvents } from './attestation';
import {
    DEFAULT_RELAYS,
    readByAddress,
    readByAttestationId,
    readByIdentity,
    signedEnvelope,
    subjectReadComplete,
    type DeclaredLimits,
    type SubjectRead,
} from './nostr';
import { nostrPubkeyToHex } from './nostr-pubkey';
import { checkCheckParams } from './options';
import { reachesCurve, toBase64Maybe } from './utils/signature';
import { ISSUED_AHEAD_MS, rfc3339Ms } from './utils/time';
import { unreadReason } from './unread';
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
    /**
     * Sats bonded on-chain for the bonded UTXO set. Not a reading when
     * `reasons` holds any `*_unread` (see `unreadReason`): 0 there means the
     * coins were not read, never that there are none.
     */
    sats: number;
    /**
     * Days since the youngest UTXO in the bonded set was confirmed. Not a
     * reading when `reasons` holds any `*_unread`.
     */
    days: number;
    /** Reference `score_v0` for this attestation. Not a reading when `reasons` holds any `*_unread`. */
    score: number;
    /** Attestation ID (if one was found). */
    attestation_id?: string;
    /** Bitcoin address of the attestation. */
    address?: string;
    /** Self-asserted identity bindings. Verify independently. */
    identities?: IdentityBinding[];
    /** Network the address belongs to. */
    network?: Network;
    /**
     * Present when `ok === false`. Codes explain why: verify()'s codes, and
     * `not_found` (no attestation, on a read the relays finished),
     * `attestation_unread` (none found, but too few relays finished the read, so
     * one may be there, or more copies whose signature fails came first than
     * check() verifies, so a real one may be behind them; ask again),
     * `below_min_sats`, `below_min_days`, `stake_shared` (the
     * address also backs another identity on the protocol) and `stake_unread`
     * (the address's other attestations could not be read in full, or checked
     * within the budget, so one
     * address, one bond was not checked; ask again). The stake is read only
     * when everything else passed, so `stake_shared` and `stake_unread` only
     * ever come alone. When the coins could not be read (1.21.0): `chain_unread`
     * beside the signature code and `bad_request` (no chain API answered; ask
     * again), or `utxo_cap_unread` or `provider_refused_unread` alone (the
     * address holds more coins than the chain APIs list, or one refused the
     * lookup). None of these comes with `below_min_*`. Decode with
     * `unreadReason` before mapping a reason to words.
     */
    reasons?: string[];
    /** The HTTP status a chain API refused the lookup with, beside `provider_refused_unread` only. */
    chain_status?: number;
}

/**
 * Find the subject's attestation, verify it against live chain state, and
 * compare it with the thresholds. The result is not a reading when `reasons`
 * holds any `*_unread` (`unreadReason(result.reasons) !== null`): nothing was
 * concluded, so say "couldn't check", never "below threshold" or "0 sats".
 */
export async function check(params: CheckParams): Promise<CheckResult> {
    checkCheckParams(params);
    const {
        addr: rawAddr,
        id,
        identity,
        minSats = 0,
        minDays = 0,
        relays = DEFAULT_RELAYS,
        verifyOptions,
    } = params;

    // An address is read checksum and all, in the one spelling attestations are
    // tagged under (a QR code's capitals lowercased). Anything else is a bad
    // request, never asked about: a typo would read as an address with nothing.
    // An empty or blank addr is no address, as it always was: an id or identity beside it decides.
    const addr = rawAddr?.trim() ? normalizeAddress(rawAddr) : undefined;
    if ((!addr && !id && !identity) || addr === null) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['bad_request'] };
    }

    // A named relay's NIP-11 is asked once for both of the call's reads, a failed GET included.
    const asked: DeclaredLimits = new Map();
    const read: SubjectRead = id
        ? await readByAttestationId(id, relays, asked)
        : addr
          ? await readByAddress(addr, relays, asked)
          : await readByIdentity(identity!.protocol, identity!.identifier, relays, asked);
    const found: AttestationEnvelope[] = await envelopesFromEvents(read.events);

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
        // Absent only on a read the relays finished: a relay that didn't answer,
        // refused, or was cut off may hold it. The `_unread` suffix is what
        // relay-filter and gate read as an incomplete lookup, never a bad proof.
        const reason = subjectReadComplete(read) ? 'not_found' : 'attestation_unread';
        return { ok: false, sats: 0, days: 0, score: 0, reasons: [reason] };
    }

    // The newest whose signature holds (SPEC §7.2), within the call's budget.
    const sigs = signatureChecks();
    let holding: AttestationEnvelope | undefined;
    let unchecked = false;
    for (const candidate of envelopes) {
        const holds = sigs.check(candidate);
        if (holds === null) {
            unchecked = true;
            break;
        }
        if (await holds) {
            holding = candidate;
            break;
        }
    }
    // Forged copies past the budget may hide a real one: unread, never the
    // newest forged copy and never not_found. With every copy checked and none
    // holding, the newest is answered, and verify() says why it fails.
    if (!holding && unchecked) {
        return { ok: false, sats: 0, days: 0, score: 0, reasons: ['attestation_unread'] };
    }
    const env = holding ?? envelopes[0]!;

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

    // Coins that were not read are unread, never below a threshold: no
    // below_min_* beside it. A cap or a refusal is the one reason, so a decoder
    // that reads a lone *_unread as an incomplete lookup closes it.
    const unread = unreadReason(outcome.codes);
    if (unread === 'utxo_cap_unread' || unread === 'provider_refused_unread') {
        return {
            ok: false,
            sats,
            days,
            score,
            attestation_id: env.attestation_id,
            address: env.address,
            identities: signedIdentities(env),
            network: outcome.network,
            reasons: [unread],
            ...(outcome.chain_status !== undefined ? { chain_status: outcome.chain_status } : {}),
        };
    }

    const reasons: string[] = [];
    if (!outcome.ok) reasons.push(...outcome.codes);
    if (!unread && sats < minSats) reasons.push('below_min_sats');
    if (!unread && days < minDays) reasons.push('below_min_days');

    // SECURITY.md §3: one address, one bond. An address that also backs a
    // different identity on the same protocol is lending one stake to several.
    // Read only once everything else has passed, so stake_shared and
    // stake_unread are each ever the one reason, and a failing check costs no
    // paged read. "Not shared" rests on no such attestation being there, so it
    // needs a read of the address a flood could not cut off; else it is unread.
    if (outcome.ok && reasons.length === 0 && identity) {
        const stake = await backsOtherIdentity(env, identity, relays, sigs, asked);
        if (stake === 'shared') reasons.push('stake_shared');
        if (stake === 'unread') reasons.push('stake_unread');
    }

    const ok = outcome.ok && reasons.length === 0;

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

/**
 * At most this many signature checks that reach curve math a check() makes.
 * Anyone can publish under an address's or a handle's tag beside a signature
 * that does not hold; one shaped like a real signature costs a few
 * milliseconds to turn away, and relays return up to a thousand copies. Junk
 * bytes are turned away before any curve math (see reachesCurve) and are
 * checked free, so a flood of junk never hides a real attestation. The cost
 * that stays: about this many well-formed forgeries newer than a real
 * attestation make its check read attestation_unread (ask again), never
 * not_found and never the forged copy.
 */
export const VERIFY_BUDGET = 64;

/** One check() call's signature checks, VERIFY_BUDGET of them charged. */
function signatureChecks() {
    let spent = 0;
    return {
        /** Whether `e`'s signature holds; null when it would be charged and the budget is spent. */
        check(e: AttestationEnvelope): Promise<boolean> | null {
            if (reachesCurve(e.address, toBase64Maybe(e.signature))) {
                if (spent >= VERIFY_BUDGET) return null;
                spent++;
            }
            return signedBy(e);
        },
    };
}

/**
 * Whether the address that signed `env` also backs another identity on the
 * same protocol. Anyone can publish under the address's `t` tag, and relays
 * answer newest first up to their cap, so a flood dated after the address's
 * other attestation pushes it out of a read. One found is shared whatever the
 * read; none found is not_shared only when subjectReadComplete holds, and
 * unread otherwise.
 *
 * Why one cut-off relay blocks, though the floor is met: the floor forces a
 * holder of a record among the complete reads only for a record written to at
 * least the write quorum of the relays asked. The other attestation is written
 * by the address holder, the party who gains from hiding it, and nothing makes
 * a publisher wait for a quorum (attest.ochk.io and publishAttestation succeed
 * on one relay). So it may sit on the one relay the holder then floods. The
 * cost is availability: a flood under an address on one relay makes its
 * identity checks unread until the flood is gone. So does a sibling naming
 * another identity that the call's signature budget leaves unchecked.
 */
async function backsOtherIdentity(
    env: AttestationEnvelope,
    identity: Identity,
    relays: string[],
    sigs: ReturnType<typeof signatureChecks>,
    asked: DeclaredLimits
): Promise<'shared' | 'not_shared' | 'unread'> {
    const want = identityKey(identity);
    const protocol = identity.protocol.trim().toLowerCase();
    const read = await readByAddress(env.address, relays, asked);
    const siblings = await envelopesFromEvents(read.events);
    let unchecked = false;
    for (const e of [env, ...siblings]) {
        if (!signedMatch(e, { addr: env.address })) continue;
        const other = signedIdentities(e).some(
            (b) => b.protocol.trim().toLowerCase() === protocol && identityKey(b) !== want
        );
        if (!other) continue;
        if (e === env) return 'shared';
        // Only the address's own signature can lend its stake to another identity.
        const holds = sigs.check(e);
        if (holds === null) unchecked = true;
        else if (await holds) return 'shared';
    }
    return subjectReadComplete(read) && !unchecked ? 'not_shared' : 'unread';
}
