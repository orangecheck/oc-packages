import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hostOf, keyedId, networkKey, networkOf } from './index';

// Written by an independent reference (Python's ipaddress, RFC 5869 by hand).
const V = JSON.parse(readFileSync(new URL('../../test-vectors/network-key.json', import.meta.url), 'utf8')) as {
    network_of: { ip: string; network: string }[];
    host_of: { ip: string; host: string }[];
    keyed_id: { secret: string; purpose: string; kind: string; value: string; id: string }[];
    network_key: { ip: string; secret: string; purpose: string; id: string }[];
};

describe('networkOf (test-vectors/network-key.json)', () => {
    it.each(V.network_of.map((c) => [c.ip, c.network] as const))('%j is %s', (ip, network) => {
        expect(networkOf(ip)).toBe(network);
    });
});

describe('hostOf (test-vectors/network-key.json)', () => {
    it.each(V.host_of.map((c) => [c.ip, c.host] as const))('%j is %s', (ip, host) => {
        expect(hostOf(ip)).toBe(host);
    });
});

/** Whether `host` lies inside `network`, read from the two strings alone. */
function inside(host: string, network: string): boolean {
    if (network.startsWith('other:')) return host === network;
    if (network.endsWith('.0/24')) {
        return /^\d+\.\d+\.\d+\.\d+$/.test(host) && `${host.split('.').slice(0, 3).join('.')}.0/24` === network;
    }
    if (network.endsWith('::/48')) {
        return host.endsWith('::/64') && `${host.slice(0, -5).split(':').slice(0, 3).join(':')}::/48` === network;
    }
    return false;
}

describe('a host lies inside its network', () => {
    it.each(V.host_of.map((c) => c.ip))('%j', (ip) => {
        expect(inside(hostOf(ip), networkOf(ip))).toBe(true);
    });

    it('for well-formed, mapped and broken text alike', () => {
        let seed = 7;
        const r = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
        const hex = () => r(0x10000).toString(16);
        const noise = ['', ' ', '0', ':', '.', '::', '%1', 'x'];
        for (let i = 0; i < 4000; i++) {
            const g = Array.from({ length: 8 }, hex);
            const cut = r(8);
            const forms = [
                `${r(256)}.${r(256)}.${r(256)}.${r(256)}`,
                `::ffff:${r(256)}.${r(256)}.${r(256)}.${r(256)}`,
                `::ffff:${hex()}:${hex()}`,
                g.join(':'),
                `${g.slice(0, cut).join(':')}::${g.slice(cut + 1).join(':')}`,
            ];
            for (const f of forms) {
                const ip = r(4) === 0 ? f + noise[r(noise.length)]! : f;
                expect(inside(hostOf(ip), networkOf(ip)), ip).toBe(true);
            }
        }
    });
});

describe('keyedId', () => {
    it.each(V.keyed_id.map((c) => [`${c.purpose} ${c.kind}`, c] as const))('%s', (_name, c) => {
        expect(keyedId(c.secret, c.purpose, c.kind, c.value)).toBe(c.id);
    });

    it('needs a secret, a purpose and a kind', () => {
        expect(() => keyedId('', 'p', 'k', 'v')).toThrow(TypeError);
        expect(() => keyedId('s', '', 'k', 'v')).toThrow(TypeError);
        expect(() => keyedId('s', 'p', '', 'v')).toThrow(TypeError);
    });
});

describe('networkKey', () => {
    it.each(V.network_key.map((c) => [c.ip, c] as const))('%j', (_ip, c) => {
        expect(networkKey(c.ip, c.secret, c.purpose)).toBe(c.id);
    });

    it('gives one network one key, and a neighbour network another', () => {
        const k = (ip: string) => networkKey(ip, 's', 'p');
        expect(k('203.0.113.1')).toBe(k('::ffff:203.0.113.200'));
        expect(k('2001:db8:1:2::1')).toBe(k('2001:db8:1:ffff::9'));
        expect(k('203.0.114.1')).not.toBe(k('203.0.113.1'));
        expect(k('2001:db8:2::1')).not.toBe(k('2001:db8:1::1'));
    });
});
