// SPEC §9.1: a revocation's reason is ASCII, at most 128 bytes, "" when there
// is none. Verifiers apply exactly that (reasonProblem): refusing more would
// keep alive a delegation its owner revoked within the spec. We write stricter
// (authoredReasonProblem): printable ASCII only, since a control character, a
// line break above all, changes the shape of the signed message. A reason is
// shown with its control characters escaped (shownReason), never dropped.

/** The most bytes a revocation reason may hold (SPEC §9.1). */
export const REVOCATION_REASON_MAX_BYTES = 128;

/** Why a value breaks SPEC §9.1's reason rule. */
export type ReasonProblem = 'not_text' | 'not_ascii' | 'too_long';

/** Why a reason is not one we write: the spec's problems, or a control character. */
export type AuthoredReasonProblem = ReasonProblem | 'control_character';

/** Why `reason` breaks SPEC §9.1, or null when it doesn't. Verifiers use this; "" is a reason. */
export function reasonProblem(reason: unknown): ReasonProblem | null {
    if (typeof reason !== 'string') return 'not_text';
    if (/[^\x00-\x7f]/.test(reason)) return 'not_ascii';
    // ASCII is one byte a character.
    if (reason.length > REVOCATION_REASON_MAX_BYTES) return 'too_long';
    return null;
}

/** Why `reason` is not one to sign: reasonProblem, or a control character. Signers use this. */
export function authoredReasonProblem(reason: unknown): AuthoredReasonProblem | null {
    const problem = reasonProblem(reason);
    if (problem) return problem;
    return /[\x00-\x1f\x7f]/.test(reason as string) ? 'control_character' : null;
}

const NAMED: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\\': '\\\\' };

/** `reason` for a person to read: each control character, and the backslash, written as an escape. */
export function shownReason(reason: string): string {
    return reason.replace(
        /[\x00-\x1f\x7f\\]/g,
        (c) => NAMED[c] ?? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`
    );
}
