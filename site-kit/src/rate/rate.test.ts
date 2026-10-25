import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { keyedId, networkKey, networkOf } from './index';

// Written by an independent reference (Python's ipaddress, RFC 5869 by hand).
const V = JSON.parse(readFileSync(new URL('../../test-vectors/network-key.json', import.meta.url), 'utf8')) as {
    network_of: { ip: string; network: string }[];
    keyed_id: { secret: string; purpose: string; kind: string; value: string; id: string }[];
    network_key: { ip: string; secret: string; purpose: string; id: string }[];
};

describe('networkOf (test-vectors/network-key.json)', () => {
    it.each(V.network_of.map((c) => [c.ip, c.network] as const))('%j is %s', (ip, network) => {
        expect(networkOf(ip)).toBe(network);
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
