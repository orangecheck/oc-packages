import type { NextApiRequest } from 'next';

import { parseIp } from '../rate/parse-ip';

/**
 * `clientIp(req)`: the visitor's address as a pages API route sees it, read as ./rate reads one.
 * Server only. The entry keeps its name because sites import it from here.
 */

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();

/**
 * An address as ./rate reads one. An IPv6 zone id is dropped, so the address keys with its /64; an
 * IPv4-mapped address, in any spelling, is its IPv4 address.
 */
const asIp = (s: string): string | undefined => {
    const ip = s.includes(':') ? s.replace(/%[\w.~-]+$/, '') : s;
    const a = parseIp(ip);
    if (!a) return undefined;
    return 'v4' in a ? a.v4.join('.') : ip;
};

/** The visitor's address: Vercel's x-real-ip, else the first x-forwarded-for hop, else the socket's. */
export function clientIp(req: Pick<NextApiRequest, 'headers' | 'socket'>): string | undefined {
    return (
        asIp(first(req.headers['x-real-ip'])) ??
        asIp(first(req.headers['x-forwarded-for']).split(',')[0]!.trim()) ??
        asIp(req.socket?.remoteAddress ?? '')
    );
}
