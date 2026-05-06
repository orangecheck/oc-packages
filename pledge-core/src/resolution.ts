// Resolution-grammar validation — SPEC §3.4.
//
// The seven mechanisms each have a fixed-shape query string. This module
// validates that a query string conforms to its mechanism's grammar at the
// regex level. Full evaluation against public state (querying chain RPC,
// fetching HTTP, resolving DNS-over-HTTPS) is out of scope here — pledge-core
// stays a pure SDK; consumers wire I/O.
//
// The grammars are loose on purpose — SPEC §3.4 describes the canonical
// forms but allows mechanism-specific extensions through REGISTRY.md. The
// regexes accept the canonical forms documented in the SPEC plus their
// straightforward combinations (e.g. `chain_state` AND-joined predicates).
//
// `self_proof` is explicitly refused (§3.4.8); validateResolutionQuery returns
// an error code for any attempt.

import type { ResolutionMechanism } from './types.js';

export type ResolutionValidateResult =
    | { ok: true; mechanism: ResolutionMechanism }
    | { ok: false; code: 'E_RESOLUTION_UNKNOWN' | 'E_RESOLUTION_NONDETERMINISTIC'; reason: string };

const ALLOWED_MECHANISMS: ResolutionMechanism[] = [
    'chain_state',
    'counterparty_signs',
    'nostr_event_exists',
    'stamp_published',
    'http_get_hash',
    'dns_record',
    'vote_resolves',
];

const REFUSED_MECHANISMS = ['self_proof'];

// Regexes for each mechanism's canonical query grammar (SPEC §3.4.1–§3.4.7).
const CHAIN_STATE_ATOM = new RegExp(
    [
        // block(N).hash.startsWith(hex_prefix)
        /block\(\d+\)\.hash\.startsWith\([0-9a-fA-F]+\)/.source,
        // block(N).exists
        /block\(\d+\)\.exists/.source,
        // tx(txid).confirmed
        /tx\([0-9a-fA-F]{64}\)\.confirmed/.source,
        // tx(txid).confirmations >= N
        /tx\([0-9a-fA-F]{64}\)\.confirmations\s*>=\s*\d+/.source,
        // address(addr).balance OP <sats>
        /address\([^)]+\)\.balance\s*(?:>=|<=|<|>|==)\s*\d+(?:\s+AT\s+block\(\d+\))?/.source,
        // address(addr).utxo_count OP <N>
        /address\([^)]+\)\.utxo_count\s*(?:>=|<=|<|>|==)\s*\d+/.source,
    ].join('|'),
);

const COUNTERPARTY_SIGNS_RE = /^counterparty\([^)]+\)\s+signs\s+outcome\s+over\s+pledge_id$/;

const NOSTR_EVENT_EXISTS_RE =
    /^kind=\d+\s+author=\S+(?:\s+tag\([^)]+\)=\S+)?\s+created_at_before=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const STAMP_PUBLISHED_RE = /^stamp\(content_hash=sha256:[0-9a-f]{64},\s*signer=\S+\)$/;

const HTTP_GET_HASH_RE = /^GET\s+https:\/\/\S+\s+body_sha256\s*==\s*[0-9a-f]{64}$/;

const DNS_RECORD_RE = /^(?:A|AAAA|TXT|CAA|MX|CNAME)\s+\S+\s*==\s*\S.*$/;

const VOTE_RESOLVES_RE =
    /^poll_id=[0-9a-f]{64}\s+option=\S+\s+threshold=(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

/**
 * Validate the (mechanism, query) pair against §3.4.
 *
 * Returns ok+mechanism for the seven legitimate mechanisms with conforming
 * queries; returns error otherwise. The error code matches SPEC §10
 * (E_RESOLUTION_UNKNOWN for unknown mechanisms, E_RESOLUTION_NONDETERMINISTIC
 * for self_proof attempts and malformed query strings).
 */
export function validateResolutionQuery(
    mechanism: string,
    query: string,
): ResolutionValidateResult {
    if (REFUSED_MECHANISMS.includes(mechanism)) {
        return {
            ok: false,
            code: 'E_RESOLUTION_NONDETERMINISTIC',
            reason: `mechanism "${mechanism}" is explicitly refused (SPEC §3.4.8 / WHY §H3)`,
        };
    }
    if (!ALLOWED_MECHANISMS.includes(mechanism as ResolutionMechanism)) {
        return {
            ok: false,
            code: 'E_RESOLUTION_UNKNOWN',
            reason: `mechanism "${mechanism}" is not in the SPEC §3.4 set`,
        };
    }

    const m = mechanism as ResolutionMechanism;

    if (/[\n\r]/.test(query)) {
        return {
            ok: false,
            code: 'E_RESOLUTION_NONDETERMINISTIC',
            reason: 'query must be a single line (no LF or CR)',
        };
    }
    if (new TextEncoder().encode(query).byteLength > 1024) {
        return {
            ok: false,
            code: 'E_RESOLUTION_NONDETERMINISTIC',
            reason: 'query exceeds 1024 UTF-8 bytes',
        };
    }

    switch (m) {
        case 'chain_state': {
            // Allow `<atom>` and `<atom> AND <atom> AND ...`.
            const parts = query.split(/\s+AND\s+/);
            for (const p of parts) {
                if (!new RegExp(`^(?:${CHAIN_STATE_ATOM.source})$`).test(p.trim())) {
                    return rNonDet(`chain_state predicate not in §3.4.1 grammar: "${p}"`);
                }
            }
            return { ok: true, mechanism: m };
        }
        case 'counterparty_signs':
            if (!COUNTERPARTY_SIGNS_RE.test(query)) {
                return rNonDet('counterparty_signs query must match §3.4.2 canonical form');
            }
            return { ok: true, mechanism: m };
        case 'nostr_event_exists':
            if (!NOSTR_EVENT_EXISTS_RE.test(query)) {
                return rNonDet('nostr_event_exists query not in §3.4.3 grammar');
            }
            return { ok: true, mechanism: m };
        case 'stamp_published':
            if (!STAMP_PUBLISHED_RE.test(query)) {
                return rNonDet('stamp_published query not in §3.4.4 grammar');
            }
            return { ok: true, mechanism: m };
        case 'http_get_hash':
            if (!HTTP_GET_HASH_RE.test(query)) {
                return rNonDet('http_get_hash query not in §3.4.5 grammar');
            }
            return { ok: true, mechanism: m };
        case 'dns_record':
            if (!DNS_RECORD_RE.test(query)) {
                return rNonDet('dns_record query not in §3.4.6 grammar');
            }
            return { ok: true, mechanism: m };
        case 'vote_resolves':
            if (!VOTE_RESOLVES_RE.test(query)) {
                return rNonDet('vote_resolves query not in §3.4.7 grammar');
            }
            return { ok: true, mechanism: m };
    }
}

function rNonDet(reason: string): ResolutionValidateResult {
    return { ok: false, code: 'E_RESOLUTION_NONDETERMINISTIC', reason };
}
