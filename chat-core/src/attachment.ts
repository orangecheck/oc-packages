// An inline file attachment (SPEC §5.1, §8.3.2). Its bytes are attacker-influenced,
// and on a public channel post they are fully attacker-chosen.

export interface Attachment {
    /** Original file name. */
    name: string;
    /** MIME type, untrusted off the wire. */
    type: string;
    /** Raw byte size (before base64). */
    size: number;
    /** base64 of the raw file bytes. */
    data: string;
}

/** Hard ceiling for an inline attachment (~100KB, ~135KB base64), whatever its source. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024;

/** Is a parsed attachment the §5.1 shape, real base64 and within the byte cap?
 *  A post whose attachment fails is malformed and never renders. */
export function isValidAttachment(a: unknown): a is Attachment {
    if (!a || typeof a !== 'object') return false;
    const o = a as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.type !== 'string') return false;
    if (typeof o.size !== 'number' || !(o.size >= 0 && o.size <= MAX_ATTACHMENT_BYTES)) return false;
    if (typeof o.data !== 'string') return false;
    if (o.data.length > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8) return false;
    // atob throws on a string that is not base64, which would crash a feed at render time.
    try {
        if (atob(o.data).length > MAX_ATTACHMENT_BYTES) return false;
    } catch {
        return false;
    }
    return true;
}
