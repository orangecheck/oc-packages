import type { RevocationFlag } from './types.js';

// SPEC §9.1: a signer writes a revocation's reason as printable ASCII, at most
// 128 bytes, "" when there is none (authoredReasonProblem). A verifier never
// reads the reason to decide: a validly signed revocation revokes whatever it
// holds. A reason is shown with its control and invisible characters escaped
// (shownReason), never dropped.

/** The most bytes a signer writes in a revocation reason (SPEC §9.1). */
export const REVOCATION_REASON_MAX_BYTES = 128;

/** Why a reason is not one to sign. */
export type AuthoredReasonProblem = 'not_text' | 'not_ascii' | 'control_character' | 'too_long';

/** Why `reason` is not one to sign, or null when it is. Signers use this; verifiers never do. "" is a reason. */
export function authoredReasonProblem(reason: unknown): AuthoredReasonProblem | null {
    if (typeof reason !== 'string') return 'not_text';
    if (/[^\x00-\x7f]/.test(reason)) return 'not_ascii';
    if (/[\x00-\x1f\x7f]/.test(reason)) return 'control_character';
    // Printable ASCII is one byte a character.
    if (reason.length > REVOCATION_REASON_MAX_BYTES) return 'too_long';
    return null;
}

const NAMED: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\\': '\\\\' };

/**
 * What shownReason writes as an escape: the family's hidden characters (auth-core's
 * HIDDEN_TEXT_CHARS, kept equal by reason.test.ts), variation selectors, the line and
 * paragraph separators, and the backslash.
 */
const ESCAPED =
    /[\p{Cc}\p{Cf}\p{Cs}\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2028\u2029\u2800\u3164\ufe00-\ufe0f\uffa0\ufff0-\ufff8\u{e0000}-\u{e0fff}\\]/gu;

/**
 * `reason` for a person to read: each control or invisible character, and the
 * backslash, written as an escape; "no reason given" when there is none.
 */
export function shownReason(reason: unknown): string {
    if (typeof reason !== 'string' || reason === '') return 'no reason given';
    return reason.replace(ESCAPED, (c) => {
        const cp = c.codePointAt(0)!;
        return NAMED[c] ?? (cp < 0x80 ? `\\x${cp.toString(16).padStart(2, '0')}` : `\\u{${cp.toString(16)}}`);
    });
}

/** The flags for `env`, whose id computed from its signed fields is `id`. */
export function revocationFlags(env: { kind?: unknown; id?: unknown; reason?: unknown }, id: string): RevocationFlag[] {
    const flags: RevocationFlag[] = [];
    if (env.id !== id) flags.push('id_mismatch');
    if (env.kind !== 'agent-revocation') flags.push('kind_nonconforming');
    if (authoredReasonProblem(env.reason ?? '')) flags.push('reason_nonconforming');
    return flags;
}
