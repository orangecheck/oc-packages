import { describe, expect, it } from 'vitest';

import {
    canonicalizeFunctionCall,
    functionCallHash,
    parseFunctionCall,
} from './index.js';

describe('parseFunctionCall', () => {
    it('parses a Chat Completions tool_call', () => {
        const c = parseFunctionCall({
            id: 'call_abc',
            type: 'function',
            function: {
                name: 'invoice.create',
                arguments: '{"customer":"acme","amount":14.2}',
            },
        });
        expect(c.id).toBe('call_abc');
        expect(c.name).toBe('invoice.create');
        expect(c.arguments).toEqual({ customer: 'acme', amount: 14.2 });
    });

    it('parses a Responses function_call item', () => {
        const c = parseFunctionCall({
            type: 'function_call',
            call_id: 'call_xyz',
            name: 'invoice.refund',
            arguments: '{"order":"o_99","amount":22.5}',
        });
        expect(c.id).toBe('call_xyz');
        expect(c.name).toBe('invoice.refund');
        expect(c.arguments).toEqual({ order: 'o_99', amount: 22.5 });
    });

    it('handles already-parsed arguments', () => {
        const c = parseFunctionCall({
            id: 'call_abc',
            name: 'invoice.create',
            arguments: { customer: 'acme', amount: 14.2 },
        });
        expect(c.arguments).toEqual({ customer: 'acme', amount: 14.2 });
    });

    it('handles malformed argument strings without throwing', () => {
        const c = parseFunctionCall({
            id: 'call_abc',
            name: 'invoice.create',
            arguments: 'not-json',
        });
        expect(c.arguments).toEqual({ _raw: 'not-json' });
    });
});

describe('canonicalizeFunctionCall', () => {
    it('produces byte-identical output across Chat Completions vs Responses shapes', () => {
        const cc = parseFunctionCall({
            id: 'call_abc',
            type: 'function',
            function: {
                name: 'invoice.create',
                arguments: '{"customer":"acme","amount":14.2}',
            },
        });
        const rsp = parseFunctionCall({
            type: 'function_call',
            call_id: 'call_abc',
            name: 'invoice.create',
            arguments: '{"amount":14.2,"customer":"acme"}',
        });
        expect(canonicalizeFunctionCall(cc)).toEqual(canonicalizeFunctionCall(rsp));
    });

    it('differs when arguments differ', () => {
        const a = functionCallHash(
            parseFunctionCall({
                id: 'c',
                name: 'x',
                arguments: '{"a":1}',
            })
        );
        const b = functionCallHash(
            parseFunctionCall({
                id: 'c',
                name: 'x',
                arguments: '{"a":2}',
            })
        );
        expect(a).not.toBe(b);
    });
});
