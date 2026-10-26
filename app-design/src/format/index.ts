/*
 * Formatting for the things the family shows over and over: Bitcoin
 * explorer links, shortened ids, block heights, the time to a block. No
 * React, so server code and OG renderers import it too.
 */

export type Network = 'mainnet' | 'testnet' | 'testnet4' | 'signet';
export type ExplorerKind = 'address' | 'tx' | 'block';

const EXPLORER = 'https://mempool.space';

/** A mempool.space link for an address, a transaction, or a block (by height or hash). */
export function explorerUrl(kind: ExplorerKind, value: string | number, network: Network = 'mainnet'): string {
    const net = network === 'mainnet' ? '' : `/${network}`;
    return `${EXPLORER}${net}/${kind}/${encodeURIComponent(String(value))}`;
}

/** head…tail, leaving short values whole. */
export function shortenMiddle(value: string, head = 8, tail = 6): string {
    return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** 971632 → "971,632". */
export function formatBlockHeight(height: number): string {
    return Math.trunc(height).toLocaleString('en-US');
}

/**
 * How long a number of blocks takes at ten minutes each, in the largest two
 * units: "about 40 minutes", "about 2 days 13 hours". Blocks come when they
 * come, so it is always "about".
 */
export function blocksToDuration(blocks: number, minutesPerBlock = 10): string {
    const minutes = Math.max(0, Math.round(blocks * minutesPerBlock));
    if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const units: [number, string][] = [
        [60 * 24 * 7, 'week'],
        [60 * 24, 'day'],
        [60, 'hour'],
        [1, 'minute'],
    ];
    const parts: string[] = [];
    let rest = minutes;
    for (const [size, word] of units) {
        const n = Math.floor(rest / size);
        if (n > 0 && parts.length < 2) {
            parts.push(`${n} ${word}${n === 1 ? '' : 's'}`);
            rest -= n * size;
        } else if (parts.length > 0) break;
    }
    return `about ${parts.join(' ')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A moment in UTC, the same for every reader: "20 Oct 2026, 09:14 UTC".
 * Takes a Date, an ISO string, or unix seconds. `date: true` drops the time.
 */
export function formatUtc(at: Date | string | number, opts: { date?: boolean } = {}): string {
    const d = typeof at === 'number' ? new Date(at * 1000) : new Date(at);
    if (Number.isNaN(d.getTime())) return '—';
    const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    if (opts.date) return day;
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day}, ${hh}:${mm} UTC`;
}

/** 482113 → "471 KB"; 1288490 → "1.2 MB". Binary steps, the way a file dialog counts. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = bytes / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)} ${units[u]}`;
}

/**
 * What a map says for a code from outside the app (a server's reason, a link's
 * fragment), read from the map's own keys only. Anything else, `constructor`
 * and `__proto__` included, is the fallback, never what the lookup returns.
 */
export function wordFor<V, F>(map: Readonly<Record<string, V>>, code: unknown, fallback: F): V | F {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(map, code) ? (map[code] as V) : fallback;
}

/** What a person reads when a request got no answer: offline, a dropped connection, a blocked request. */
export const OFFLINE_TEXT = 'Check your connection, then try again.';

export interface FailureTextOptions {
    /** Who did not answer, by the name a person knows it by: "mempool.space". */
    source?: string;
    /** The sentence for every other failure. "Something went wrong. Try again." by default. */
    fallback?: string;
    /** Show an Error's own message. Only for one this site's code wrote as a sentence. */
    keepMessage?: boolean;
}

// fetch's TypeError for "no answer", in Chrome, Firefox, Safari and Node; any other TypeError is a bug.
const NO_ANSWER = /fetch|load failed|network|connection/i;

/**
 * A failed request as one sentence a person can act on. The browser's own
 * words ("Failed to fetch"), a library's ("seed lookup failed: …") and a
 * code ("E_SNAPSHOT_UNRESOLVED") never reach the screen.
 */
export function failureText(
    e: unknown,
    { source, fallback = 'Something went wrong. Try again.', keepMessage = false }: FailureTextOptions = {}
): string {
    const name = typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : '';
    const message = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : '';
    // A code chunk that would not load (offline, or an old tab after a deploy) is a request with no answer too.
    const chunk = name === 'ChunkLoadError' || /^Loading (?:CSS )?chunk \S+ failed/.test(message);
    const unanswered = chunk || name === 'AbortError' || name === 'TimeoutError' || (e instanceof TypeError && NO_ANSWER.test(message));
    if (unanswered) return source ? `${source} did not answer. ${OFFLINE_TEXT}` : `We couldn't reach the server. ${OFFLINE_TEXT}`;
    if (!keepMessage || !(e instanceof Error) || e instanceof TypeError || e instanceof SyntaxError) return fallback;
    // A sentence has a space in it; a bare token is a code.
    return /\s/.test(message.trim()) ? message.trim() : fallback;
}
