import { describe, expect, it } from 'vitest';

import { canonicalizeToolCall, toolCallHash, ocTool } from './index.js';

describe('canonicalizeToolCall', () => {
    it('produces byte-identical output for identical inputs (key reorder)', () => {
        const a = canonicalizeToolCall({
            callId: 'tc_1',
            verb: 'invoice.create',
            args: { customer: 'acme', amount: 14.2 },
        });
        const b = canonicalizeToolCall({
            verb: 'invoice.create',
            callId: 'tc_1',
            args: { amount: 14.2, customer: 'acme' },
        });
        expect(a).toEqual(b);
    });

    it('changes when verb changes', () => {
        const a = toolCallHash({ callId: 't', verb: 'a', args: {} });
        const b = toolCallHash({ callId: 't', verb: 'b', args: {} });
        expect(a).not.toBe(b);
    });

    it('changes when call id changes', () => {
        const a = toolCallHash({ callId: 'a', verb: 'x', args: {} });
        const b = toolCallHash({ callId: 'b', verb: 'x', args: {} });
        expect(a).not.toBe(b);
    });
});

describe('ocTool', () => {
    it('returns a wrapped tool with the right metadata', () => {
        const t = ocTool({
            verb: 'invoice.create',
            description: 'create',
            parameters: {} as unknown,
            execute: async () => 'ok',
        });
        expect(t.verb).toBe('invoice.create');
        expect(t.description).toBe('create');
    });
});
