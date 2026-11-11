import { createHmac, hkdfSync } from 'node:crypto';

import { parseIp } from './parse-ip';

/**
 * Keyed ids for caps a neighbour should not share with a stranger. Server only.
 * Held to test-vectors/network-key.json.
 */

const groups = (g: number[], n: number) =>
    g
        .slice(0, n)
        .map((x) => x.toString(16))
        .join(':');

/**
 * The network an address belongs to: an IPv4 address, or an IPv4-mapped IPv6
 * address in either spelling, is its /24 ("203.0.113.0/24"); any other IPv6
 * address is its /48 ("2001:db8:1::/48"), since one /56 holds 256 /64s. Anything
 * else (a zone id, brackets, a port, a header that says "unknown") is its own
 * network, "other:" and the trimmed text.
 */
export function networkOf(ip: string): string {
    const s = ip.trim();
    const a = parseIp(s);
    if (!a) return `other:${s}`;
    if ('v4' in a) return `${a.v4[0]}.${a.v4[1]}.${a.v4[2]}.0/24`;
    return `${groups(a.v6, 3)}::/48`;
}

/**
 * The one requester behind an address, for a per-person cap under a network's:
 * an IPv4 address itself ("203.0.113.77"), an IPv4-mapped one included, or an
 * IPv6 /64 ("2001:db8:1:2::/64", one subscriber's LAN). Anything else is
 * "other:" and the trimmed text. It reads the address as networkOf does, so a
 * host always lies inside its network.
 */
export function hostOf(ip: string): string {
    const s = ip.trim();
    const a = parseIp(s);
    if (!a) return `other:${s}`;
    if ('v4' in a) return a.v4.join('.');
    return `${groups(a.v6, 4)}::/64`;
}

/**
 * A keyed, one-way id for `value`: the first 32 hex digits of
 * HMAC-SHA256(HKDF-SHA256(ikm = secret, salt = purpose, info = kind), value).
 * `purpose` keeps one site's ids apart from another's and from its other keyed
 * ids; only a holder of `secret` can compute one.
 */
export function keyedId(secret: string, purpose: string, kind: string, value: string): string {
    if (typeof secret !== 'string' || secret.length === 0) {
        throw new TypeError('@orangecheck/site-kit/rate: keyedId needs a non-empty secret');
    }
    if (typeof purpose !== 'string' || purpose.length === 0 || typeof kind !== 'string' || kind.length === 0) {
        throw new TypeError('@orangecheck/site-kit/rate: keyedId needs a purpose and a kind');
    }
    const key = Buffer.from(hkdfSync('sha256', secret, purpose, kind, 32));
    return createHmac('sha256', key).update(value).digest('hex').slice(0, 32);
}

/** The keyed id a request's network is counted under: keyedId(secret, purpose, 'net', networkOf(ip)). */
export function networkKey(ip: string, secret: string, purpose: string): string {
    return keyedId(secret, purpose, 'net', networkOf(ip));
}
