/** IP address parsing for ./rate and clientIp: plain text in, octets or groups out. */

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
export function parseIp(s: string): { v4: number[] } | { v6: number[] } | null {
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
