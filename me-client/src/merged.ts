/**
 * After someone merges two orangecheck accounts, the one they no longer use
 * stops signing in. A token from the sign-in popup then carries `merged_rh`:
 * your site's revocation handle for each account merged in. Match it against
 * the handles you stored (every `rh` you have seen, kept with your user) to
 * keep that person's history under the account they use now.
 */

/** At most this many handles ride one token; a longer claim is not read. */
const MERGED_HANDLES_MAX = 16;

/** What a token's merged handles name in your own table. */
export type MergedUserMatch =
    | { kind: 'none' }
    | { kind: 'one'; user: string }
    | { kind: 'conflict'; users: string[] };

/**
 * The merged handles on a session `verifyOcToken` or `checkOcSession` already
 * accepted. A claim that is not a list of at most 16 non-empty strings reads
 * as none.
 */
export function mergedHandles(session: { merged_rh?: unknown }): string[] {
    const v = session.merged_rh;
    if (!Array.isArray(v) || v.length > MERGED_HANDLES_MAX) return [];
    if (!v.every((h) => typeof h === 'string' && h.length > 0)) return [];
    return [...new Set(v as string[])];
}

/**
 * Which of your users this person was before a merge. Call it with a verified
 * session whose `did_oc` you have no row for. `lookup` answers the user that
 * stored a handle, or null.
 *
 * - `none`: create a user, as for anyone new.
 * - `one`: attach this `did_oc` and `rh` to that user.
 * - `conflict`: the handles name two of your users. Pick neither; log it.
 */
export async function matchMergedUser(
    session: { merged_rh?: unknown },
    lookup: (rh: string) => string | null | undefined | Promise<string | null | undefined>
): Promise<MergedUserMatch> {
    const users = new Set<string>();
    for (const rh of mergedHandles(session)) {
        const user = await lookup(rh);
        if (typeof user === 'string' && user.length > 0) users.add(user);
    }
    if (users.size === 0) return { kind: 'none' };
    if (users.size === 1) return { kind: 'one', user: [...users][0]! };
    return { kind: 'conflict', users: [...users].sort() };
}
