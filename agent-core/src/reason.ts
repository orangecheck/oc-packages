// SPEC §9.1: a signer writes a revocation's reason as printable ASCII, at most
// 128 bytes, "" when there is none (authoredReasonProblem). A verifier never
// reads the reason to decide: a validly signed revocation revokes whatever it
// holds. A reason is shown with its control characters escaped (shownReason),
// never dropped.

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

/** `reason` for a person to read: each control character, and the backslash, written as an escape. */
export function shownReason(reason: string): string {
    return reason.replace(
        /[\x00-\x1f\x7f\\]/g,
        (c) => NAMED[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`
    );
}
