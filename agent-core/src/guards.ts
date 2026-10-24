// Input checks shared by the verifiers. Every public verifier reads relay
// data, so it checks a value's type before reading into it, comparing it or
// printing it, and answers a typed refusal instead of throwing.

/** A JSON object, not null or a list: a field read into must be one. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Non-empty text. */
export function isText(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

export function isHex64(s: unknown): s is string {
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

export function isIsoUtc(s: unknown): s is string {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s);
}

/** A value for a message: text and numbers as they are, anything else by its kind, so printing never walks it. */
export function shown(v: unknown): string {
    if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'a list';
    return typeof v === 'object' ? 'an object' : typeof v;
}

/** `now` as given, or why it cannot be used: absent means the caller's clock. */
export function nowProblem(now: unknown): string | null {
    if (now === undefined) return null;
    return now instanceof Date && !Number.isNaN(now.getTime()) ? null : 'now must be a valid Date';
}

/** A signature check whose verifier throws on what it cannot read: that signature does not verify. */
export async function signatureVerifies(
    verify: (msg: string, signatureB64: string, address: string) => Promise<boolean>,
    msg: string,
    signature: string,
    address: string
): Promise<boolean> {
    try {
        return !!(await verify(msg, signature, address));
    } catch {
        return false;
    }
}
