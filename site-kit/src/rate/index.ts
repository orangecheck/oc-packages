import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Keyed ids for caps a neighbour should not share with a stranger. Server only.
 * Held to test-vectors/network-key.json.
 */

const OCTET = /^(0|[1-9][0-9]{0,2})$/;
const GROUP = /^[0-9a-f]{1,4}$/;

function ipv4Octets(s: string): number[] | null {
    const parts = s.split('.');
    if (parts.length !== 4 || !parts.every((p) => OCTET.test(p))) return null;
    const octets = parts.map(Number);
    return octets.every((o) => o <= 255) ? octets : null;
}

/** The eight 16-bit groups of a lower-case IPv6 address, or null when it is not one. */
function ipv6Groups(s: string): number[] | null {
    let text = s;
    let tail: number[] = [];
    if (text.includes('.')) {
        // An IPv4 address in the last 32 bits: "::ffff:203.0.113.77", "64:ff9b::1.2.3.4".
        const i = text.lastIndexOf(':');
        const v4 = i < 0 ? null : ipv4Octets(text.slice(i + 1));
        if (!v4) return null;
        tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
        const prefix = text.slice(0, i + 1);
        text = prefix.endsWith('::') ? prefix : prefix.slice(0, -1);
    }
    const halves = text.split('::');
    if (halves.length > 2) return null;
    const read = (part: string) => (part === '' ? [] : part.split(':'));
    const head = read(halves[0]!);
    const rest = halves.length === 2 ? read(halves[1]!) : [];
    if (![...head, ...rest].every((g) => GROUP.test(g))) return null;
    const given = head.length + rest.length + tail.length;
    if (halves.length === 1 ? given !== 8 : given > 7) return null;
    const zeros = Array<number>(8 - given).fill(0);
    return [...head.map((g) => parseInt(g, 16)), ...zeros, ...rest.map((g) => parseInt(g, 16)), ...tail];
}

/** An address as its IPv4 octets (an IPv4-mapped IPv6 address included) or its eight IPv6 groups, or null. */
function parse(s: string): { v4: number[] } | { v6: number[] } | null {
    const v4 = ipv4Octets(s);
    if (v4) return { v4 };
    if (!/^[0-9a-f:.]+$/i.test(s) || !s.includes(':')) return null;
    const g = ipv6Groups(s.toLowerCase());
    if (!g) return null;
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
        return { v4: [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff] };
    }
    return { v6: g };
}

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
    const a = parse(s);
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
    const a = parse(s);
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
