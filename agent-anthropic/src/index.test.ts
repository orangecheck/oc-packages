import { describe, expect, it } from 'vitest';

import { canonicalizeToolUse, toolUseHash } from './index.js';

describe('canonicalizeToolUse', () => {
    it('produces byte-identical output for identical inputs (key reorder)', () => {
        const a = canonicalizeToolUse({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { customer: 'acme', amount: 14.2 },
        });
        const b = canonicalizeToolUse({
            id: 'toolu_01abc',
            input: { amount: 14.2, customer: 'acme' }, // keys reordered
            name: 'invoice.create',
        });
        expect(a).toEqual(b);
    });

    it('produces different hashes for different argument values', () => {
        const h1 = toolUseHash({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { amount: 14.2 },
        });
        const h2 = toolUseHash({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { amount: 28.0 },
        });
        expect(h1).not.toBe(h2);
    });

    it('changes when the tool name changes', () => {
        const h1 = toolUseHash({ id: 't1', name: 'a', input: {} });
        const h2 = toolUseHash({ id: 't1', name: 'b', input: {} });
        expect(h1).not.toBe(h2);
    });

    it('changes when the tool_use id changes', () => {
        const h1 = toolUseHash({ id: 't1', name: 'a', input: {} });
        const h2 = toolUseHash({ id: 't2', name: 'a', input: {} });
        expect(h1).not.toBe(h2);
    });
});
