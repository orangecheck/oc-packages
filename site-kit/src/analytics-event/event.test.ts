import type { NextApiRequest } from 'next';
import { describe, expect, it } from 'vitest';

import { hostOf } from '../rate';
import { clientIp } from './index';

function request(over: Partial<NextApiRequest> & { headers?: Record<string, string> } = {}): NextApiRequest {
    return {
        socket: { remoteAddress: '10.0.0.9' },
        ...over,
        headers: {
            'x-real-ip': '203.0.113.7',
            'x-forwarded-for': '203.0.113.7, 10.1.1.1',
            ...over.headers,
        },
    } as unknown as NextApiRequest;
}

describe('clientIp reads the visitor from the request', () => {
    it('from x-real-ip, else the first x-forwarded-for hop, else the socket', () => {
        expect(clientIp(request())).toBe('203.0.113.7');
        expect(clientIp(request({ headers: { 'x-real-ip': '', 'x-forwarded-for': '198.51.100.4, 10.1.1.1' } }))).toBe('198.51.100.4');
        expect(clientIp(request({ headers: { 'x-real-ip': '', 'x-forwarded-for': '' } }))).toBe('10.0.0.9');
        expect(clientIp(request({ headers: { 'x-real-ip': '2001:db8::7' } }))).toBe('2001:db8::7');
    });

    it('and is undefined when none of them is an address', () => {
        const req = request({ headers: { 'x-real-ip': '203.0.113.7\r\nx-evil: 1', 'x-forwarded-for': 'not-an-ip' }, socket: {} as never });
        expect(clientIp(req)).toBeUndefined();
    });
});

describe('clientIp reads an address as ./rate does', () => {
    const ip = (realIp: string, forwarded = '198.51.100.9') =>
        clientIp(request({ headers: { 'x-real-ip': realIp, 'x-forwarded-for': forwarded } }));

    it('without its IPv6 zone id, so it keys with its /64', () => {
        expect(ip('fe80::1%eth0')).toBe('fe80::1');
        expect(ip('2001:db8:1:2::77%1')).toBe('2001:db8:1:2::77');
        expect(ip('fe80::1%eth0.100')).toBe('fe80::1');
        expect(ip('fe80::1%a~b-c_d')).toBe('fe80::1');
        expect(hostOf(ip('2001:db8:1:2::77%1')!)).toBe(hostOf('2001:db8:1:2::77'));
        const socket = { remoteAddress: 'fe80::1%eth0' } as never;
        expect(clientIp(request({ headers: { 'x-real-ip': '', 'x-forwarded-for': '' }, socket }))).toBe('fe80::1');
    });

    it('an IPv4-mapped address, in any spelling, as its IPv4 address', () => {
        const spellings = [
            '::ffff:203.0.113.77',
            '::FFFF:203.0.113.77',
            '0:0:0:0:0:ffff:203.0.113.77',
            '::ffff:cb00:714d',
            '0:0:0:0:0:ffff:cb00:714d',
        ];
        expect(spellings.map((s) => ip(s))).toEqual(spellings.map(() => '203.0.113.77'));
    });

    it('a NAT64 address with a dotted tail, keyed as its hex spelling is', () => {
        expect(ip('64:ff9b::203.0.113.77')).toBe('64:ff9b::203.0.113.77');
        expect(hostOf(ip('64:ff9b::203.0.113.77')!)).toBe(hostOf('64:ff9b::cb00:714d'));
    });

    it('and nothing else, so the next source is read', () => {
        const others = ['[2001:db8::1]', '[2001:db8::1]:443', '203.0.113.7:443', '203.0.113.7%eth0', '2001:db8::1%', 'a:b', ':::', 'unknown'];
        expect(others.map((s) => ip(s))).toEqual(others.map(() => '198.51.100.9'));
    });
});
