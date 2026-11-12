import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    BtcPayError,
    CONFIRMED_SPEED_POLICIES,
    INVOICE_ID,
    PINNED_SPEED_POLICY,
    anyPayment,
    canonicalSats,
    confirmedSats,
    confirmingPayments,
    createInvoice,
    findInvoiceByOrderId,
    getInvoice,
    markInvoiceInvalid,
    readBtcPayStore,
    readRawBody,
    satsToBtc,
    settledPayments,
    verifyBtcPaySignature,
} from '../index';

const pay = (value: string, status: string, fee = '0', id?: string) => ({ id, value, fee, status });

describe('verifyBtcPaySignature', () => {
    const secret = 's3cret';
    const raw = Buffer.from('{"invoiceId":"abc","type":"InvoiceSettled"}');
    const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

    it('takes the HMAC of the raw body under the secret, in either case', () => {
        expect(verifyBtcPaySignature(secret, raw, sig)).toBe(true);
        expect(verifyBtcPaySignature(secret, raw, sig.toUpperCase().replace('SHA256=', 'sha256='))).toBe(true);
    });

    it('refuses another secret, another body, no header, another scheme and a short or non-hex value', () => {
        expect(verifyBtcPaySignature('other', raw, sig)).toBe(false);
        expect(verifyBtcPaySignature(secret, Buffer.from(`${raw} `), sig)).toBe(false);
        expect(verifyBtcPaySignature(secret, raw, undefined)).toBe(false);
        expect(verifyBtcPaySignature(secret, raw, sig.replace('sha256=', 'sha1='))).toBe(false);
        expect(verifyBtcPaySignature(secret, raw, sig.slice(0, -2))).toBe(false);
        expect(verifyBtcPaySignature(secret, raw, `sha256=${'z'.repeat(64)}`)).toBe(false);
    });
});

class FakeReq extends EventEmitter {
    destroyed = false;
    destroy() {
        this.destroyed = true;
    }
}

describe('readRawBody', () => {
    it('gives the bytes as sent, strings and buffers alike', async () => {
        const req = new FakeReq();
        const body = readRawBody(req);
        req.emit('data', Buffer.from('{"a":'));
        req.emit('data', '1}');
        req.emit('end');
        expect((await body).toString()).toBe('{"a":1}');
    });

    it('stops at the cap: rejects payload_too_large and destroys the stream', async () => {
        const req = new FakeReq();
        const body = readRawBody(req, 4);
        req.emit('data', Buffer.from('abc'));
        req.emit('data', Buffer.from('de'));
        req.emit('end');
        await expect(body).rejects.toThrow('payload_too_large');
        expect(req.destroyed).toBe(true);
    });

    it('passes a stream error on', async () => {
        const req = new FakeReq();
        const body = readRawBody(req);
        req.emit('error', new Error('reset'));
        await expect(body).rejects.toThrow('reset');
    });
});

describe('readBtcPayStore', () => {
    const full = {
        BTCPAY_SERVER_URL: 'https://pay.example//',
        BTCPAY_API_KEY: 'k',
        BTCPAY_STORE_ID: 'st',
        BTCPAY_WEBHOOK_SECRET: 'w',
    };

    it('reads the four variables under the prefix, trimming the URL', () => {
        expect(readBtcPayStore('BTCPAY_', full)).toEqual({
            ok: true,
            cfg: { serverUrl: 'https://pay.example', apiKey: 'k', storeId: 'st', webhookSecret: 'w' },
        });
    });

    it('names every one missing, under that prefix only', () => {
        expect(readBtcPayStore('OC_ME_BTCPAY_', full)).toEqual({
            ok: false,
            missing: [
                'OC_ME_BTCPAY_SERVER_URL',
                'OC_ME_BTCPAY_API_KEY',
                'OC_ME_BTCPAY_STORE_ID',
                'OC_ME_BTCPAY_WEBHOOK_SECRET',
            ],
        });
        expect(readBtcPayStore('BTCPAY_', { ...full, BTCPAY_API_KEY: '' })).toEqual({
            ok: false,
            missing: ['BTCPAY_API_KEY'],
        });
    });
});

describe('payments', () => {
    const methods = [
        {
            currency: 'BTC',
            payments: [
                pay('0.00050000', 'Settled', '0.00000500', 'tx1-0'),
                pay('0.00020000', 'Processing', '0', 'tx2-0'),
                pay('0.00010000', 'Invalid', '0', 'tx3-0'),
                pay('0.00001000', 'Settled', '0', undefined),
            ],
        },
        { currency: 'USD', payments: [pay('100', 'Settled', '0', 'usd-1')] },
    ];

    it('counts confirmed BTC sats net of the network fee, as vault grants by', () => {
        expect(confirmedSats(methods)).toBe(50_500);
        expect(confirmedSats(null)).toBe(0);
        expect(confirmedSats([{ currency: 'BTC', payments: [pay('abc', 'Settled')] }])).toBe(0);
    });

    it('gives each confirmed payment with a usable id, as me.ochk.io books by', () => {
        expect(settledPayments(methods)).toEqual([{ id: 'tx1-0', sats: 49_500 }]);
        expect(
            settledPayments([
                { currency: 'BTC', payments: [pay('0.00000100', 'Settled', '0.00000200', 'tx4-0')] },
            ])
        ).toEqual([]);
        expect(
            settledPayments([{ currency: 'BTC', payments: [pay('0.001', 'Settled', '0', 'a/b')] }])
        ).toEqual([]);
    });

    it('says what is still confirming, and whether anything was paid', () => {
        expect(confirmingPayments(methods)).toBe(1);
        expect(anyPayment(methods)).toBe(true);
        expect(anyPayment([{ currency: 'BTC', payments: [pay('0.001', 'Invalid')] }])).toBe(false);
        expect(anyPayment(undefined)).toBe(false);
    });

    it("reads BTCPay's own amount, and nothing that is not one", () => {
        expect(canonicalSats({ amount: '0.00125000' })).toBe(125_000);
        expect(canonicalSats({ amount: 0.00125 })).toBeNull();
        expect(canonicalSats({ amount: '-1' })).toBeNull();
        expect(canonicalSats({})).toBeNull();
    });

    it('writes sats as BTC exactly, and refuses what is not a sat amount', () => {
        expect(satsToBtc(80_000)).toBe('0.00080000');
        expect(satsToBtc(2_100_000_000_000_000)).toBe('21000000.00000000');
        expect(satsToBtc(0)).toBe('0.00000000');
        expect(() => satsToBtc(1.5)).toThrow();
        expect(() => satsToBtc(-1)).toThrow();
    });

    it('pins one confirmation and counts only confirmed policies', () => {
        expect(PINNED_SPEED_POLICY).toBe('MediumSpeed');
        expect(CONFIRMED_SPEED_POLICIES.has(PINNED_SPEED_POLICY)).toBe(true);
        expect(CONFIRMED_SPEED_POLICIES.has('HighSpeed')).toBe(false);
    });

    it('imports nothing, so browser code can take the payments entry', () => {
        const src = readFileSync(new URL('../payments.ts', import.meta.url), 'utf8');
        expect(src).not.toMatch(/^\s*(import|export .* from)\b/m);
        expect(src).not.toMatch(/require\(/);
    });

    it('lets no slash, dot, query or escape into a BTCPay URL', () => {
        expect(INVOICE_ID.test('XkLmNoPq12AbCdEf34GhJk')).toBe(true);
        for (const bad of ['a/b', 'a.b', 'a?b', 'a%2Fb', '', 'x'.repeat(65)]) {
            expect(INVOICE_ID.test(bad)).toBe(false);
        }
    });
});

describe('the Greenfield client', () => {
    const cfg = { serverUrl: 'https://pay.example', apiKey: 'key', storeId: 'st/1' };
    afterEach(() => vi.unstubAllGlobals());

    function stub(status: number, body: unknown) {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit) => {
                calls.push({ url, init });
                return new Response(JSON.stringify(body), { status });
            })
        );
        return calls;
    }

    it('reads under the store, with the key, uncached and bounded', async () => {
        const calls = stub(200, { id: 'inv1', status: 'New' });
        expect(await getInvoice(cfg, 'inv 1')).toEqual({ id: 'inv1', status: 'New' });
        expect(calls[0]!.url).toBe('https://pay.example/api/v1/stores/st%2F1/invoices/inv%201');
        expect(calls[0]!.init.headers).toEqual({ Authorization: 'token key' });
        expect(calls[0]!.init.cache).toBe('no-store');
        expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    });

    it('throws a BtcPayError naming the call and status, never the key', async () => {
        stub(503, { message: 'down' });
        const err = await getInvoice(cfg, 'inv1').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BtcPayError);
        expect((err as BtcPayError).status).toBe(503);
        expect((err as Error).message).toBe('btcpay GET invoices 503');
        expect((err as BtcPayError).detail).toBe('{"message":"down"}');
    });

    it('creates and voids with a JSON body', async () => {
        const calls = stub(200, { id: 'inv2' });
        await createInvoice(cfg, { amount: '0.00080000', currency: 'BTC' });
        await markInvoiceInvalid(cfg, 'inv2');
        expect(calls.map((c) => [c.init.method, c.url, c.init.body])).toEqual([
            ['POST', 'https://pay.example/api/v1/stores/st%2F1/invoices', '{"amount":"0.00080000","currency":"BTC"}'],
            ['POST', 'https://pay.example/api/v1/stores/st%2F1/invoices/inv2/status', '{"status":"Invalid"}'],
        ]);
        expect(calls[0]!.init.headers).toEqual({ Authorization: 'token key', 'Content-Type': 'application/json' });
    });

    it('finds an invoice by our order id only when its metadata names it', async () => {
        stub(200, [{ id: 'x', metadata: { orderId: 'ord-2' } }, { id: 'y', metadata: { orderId: 'ord-1' } }]);
        expect((await findInvoiceByOrderId(cfg, 'ord-1'))?.id).toBe('y');
        stub(200, [{ id: 'x', metadata: { orderId: 'ord-2' } }]);
        expect(await findInvoiceByOrderId(cfg, 'ord-1')).toBeNull();
    });
});
