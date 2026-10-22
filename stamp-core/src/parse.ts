// parseStamp() — the edge for an envelope from outside: a .stamp file, a Nostr
// event's content, a fetch body. SPEC §4.1, §4.2.

import { isSignedAt } from './canonical.js';
import { StampError } from './stamp.js';
import { ENVELOPE_VERSION, type StampEnvelope } from './types.js';

/** Larger than any envelope a calendar proof could make; refuses a hostile blob before JSON.parse. */
const MAX_TEXT_LENGTH = 1_000_000;

const HEX64 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

type Obj = Record<string, unknown>;

/**
 * Parse an untrusted envelope and check every field's shape and type
 * (SPEC §4.1, §4.2). Takes the JSON text, or a value already parsed from it.
 * Returns the envelope typed, or throws a `StampError`: `E_UNSUPPORTED_VERSION`
 * for a `v` other than 1, `E_MALFORMED` for anything else.
 *
 * Shape only: verify() still checks the id, the signature and the anchor.
 * Unknown top-level fields are kept (SPEC §4.3). A missing `content.ref`,
 * `stake` or `ots` reads as null.
 */
export function parseStamp(input: unknown): StampEnvelope {
    let value = input;
    if (typeof input === 'string') {
        if (input.length > MAX_TEXT_LENGTH) bad(`envelope is over ${MAX_TEXT_LENGTH} characters`);
        try {
            value = JSON.parse(input);
        } catch {
            bad('envelope is not JSON');
        }
    }
    const env = object(value, 'envelope');

    if (typeof env.v === 'number' && env.v !== ENVELOPE_VERSION) {
        throw new StampError('E_UNSUPPORTED_VERSION', `envelope version ${env.v} is not supported`);
    }
    if (env.v !== ENVELOPE_VERSION) bad('envelope.v must be the number 1');
    if (env.kind !== 'stamp') bad('envelope.kind must be "stamp"');
    if (typeof env.id !== 'string' || !HEX64.test(env.id)) bad('envelope.id must be 64 lowercase hex characters');

    const content = object(env.content, 'envelope.content');
    if (typeof content.hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(content.hash)) {
        bad('envelope.content.hash must be "sha256:" and 64 lowercase hex characters');
    }
    if (!Number.isSafeInteger(content.length) || (content.length as number) < 0) {
        bad('envelope.content.length must be a non-negative integer');
    }
    if (typeof content.mime !== 'string' || content.mime.length === 0 || /[\x00-\x1f]/.test(content.mime)) {
        bad('envelope.content.mime must be a non-empty string with no control characters');
    }
    const ref = content.ref ?? null;
    if (ref !== null && typeof ref !== 'string') bad('envelope.content.ref must be a string or null');

    const signer = object(env.signer, 'envelope.signer');
    if (typeof signer.address !== 'string' || signer.address.length === 0 || /[\s\x00-\x1f]/.test(signer.address)) {
        bad('envelope.signer.address must be a non-empty string with no whitespace');
    }
    if (signer.alg !== 'bip322') bad('envelope.signer.alg must be "bip322"');

    if (typeof env.signed_at !== 'string' || !isSignedAt(env.signed_at)) {
        bad('envelope.signed_at must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS.sssZ (SPEC §0)');
    }

    const stake = env.stake ?? null;
    if (stake !== null) {
        const s = object(stake, 'envelope.stake');
        if (typeof s.attestation_id !== 'string' || !HEX64.test(s.attestation_id)) {
            bad('envelope.stake.attestation_id must be 64 lowercase hex characters');
        }
        if (!isCount(s.sats_bonded)) bad('envelope.stake.sats_bonded must be a non-negative integer');
        if (!isCount(s.days_unspent)) bad('envelope.stake.days_unspent must be a non-negative integer');
    }

    const ots = env.ots ?? null;
    if (ots !== null) {
        const o = object(ots, 'envelope.ots');
        if (o.status !== 'pending' && o.status !== 'confirmed') bad('envelope.ots.status must be "pending" or "confirmed"');
        if (typeof o.proof !== 'string' || o.proof.length === 0 || !BASE64.test(o.proof)) {
            bad('envelope.ots.proof must be non-empty base64');
        }
        if (!Array.isArray(o.calendars) || !o.calendars.every((c) => typeof c === 'string')) {
            bad('envelope.ots.calendars must be an array of strings');
        }
        if (o.block_height !== null && !isCount(o.block_height)) bad('envelope.ots.block_height must be a non-negative integer or null');
        if (o.block_hash !== null && (typeof o.block_hash !== 'string' || !HEX64.test(o.block_hash))) {
            bad('envelope.ots.block_hash must be 64 lowercase hex characters or null');
        }
        if (o.upgraded_at !== null && (typeof o.upgraded_at !== 'string' || !isSignedAt(o.upgraded_at))) {
            bad('envelope.ots.upgraded_at must be a SPEC §0 timestamp or null');
        }
        if (o.status === 'confirmed' && (o.block_height === null || o.block_hash === null)) {
            bad('a confirmed envelope.ots must carry block_height and block_hash');
        }
    }

    const sig = object(env.sig, 'envelope.sig');
    if (sig.alg !== 'bip322') bad('envelope.sig.alg must be "bip322"');
    if (sig.pubkey !== signer.address) bad('envelope.sig.pubkey must equal envelope.signer.address');
    if (typeof sig.value !== 'string' || sig.value.length === 0) bad('envelope.sig.value must be a non-empty string');

    return { ...env, content: { ...content, ref }, stake, ots } as unknown as StampEnvelope;
}

function object(value: unknown, name: string): Obj {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) bad(`${name} must be an object`);
    return value as Obj;
}

function isCount(value: unknown): boolean {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function bad(message: string): never {
    throw new StampError('E_MALFORMED', message);
}
