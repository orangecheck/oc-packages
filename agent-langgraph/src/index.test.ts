import { describe, expect, it } from 'vitest';

import {
    canonicalizeToolCall,
    graphStateHash,
    toolCallHash,
} from './index.js';

describe('graphStateHash', () => {
    it('produces the same hash for key-reordered state', () => {
        const a = graphStateHash({ messages: [], step: 1, user: 'alice' });
        const b = graphStateHash({ user: 'alice', messages: [], step: 1 });
        expect(a).toEqual(b);
    });

    it('changes when state changes', () => {
        const a = graphStateHash({ step: 1 });
        const b = graphStateHash({ step: 2 });
        expect(a).not.toBe(b);
    });
});

describe('canonicalizeToolCall', () => {
    it('produces byte-identical output for identical inputs (key reorder)', () => {
        const stateHash = graphStateHash({ step: 1 });
        const a = canonicalizeToolCall({
            callId: 'tc_1',
            verb: 'invoice.create',
            args: { customer: 'acme', amount: 14.2 },
            graphStateHash: stateHash,
        });
        const b = canonicalizeToolCall({
            graphStateHash: stateHash,
            verb: 'invoice.create',
            callId: 'tc_1',
            args: { amount: 14.2, customer: 'acme' },
        });
        expect(a).toEqual(b);
    });

    it('hash changes when graph state changes', () => {
        const a = toolCallHash({
            callId: 't',
            verb: 'x',
            args: {},
            graphStateHash: graphStateHash({ step: 1 }),
        });
        const b = toolCallHash({
            callId: 't',
            verb: 'x',
            args: {},
            graphStateHash: graphStateHash({ step: 2 }),
        });
        expect(a).not.toBe(b);
    });

    it('hash changes when args change', () => {
        const stateHash = graphStateHash({ step: 1 });
        const a = toolCallHash({ callId: 't', verb: 'x', args: { a: 1 }, graphStateHash: stateHash });
        const b = toolCallHash({ callId: 't', verb: 'x', args: { a: 2 }, graphStateHash: stateHash });
        expect(a).not.toBe(b);
    });
});
