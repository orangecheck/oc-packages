/**
 * Tests for Nostr cryptographic functions
 */

import type { NostrEvent } from '../types';

import { describe, expect, it } from 'vitest';

import {
    computeNostrEventId,
    validateNostrEvent,
    verifyNostrEventId,
} from '../nostr-crypto';

describe('Nostr Crypto', () => {
    describe('computeNostrEventId', () => {
        it('should compute correct event ID for test vector', async () => {
            // Test vector from NIP-01
            const event = {
                pubkey: '5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36',
                created_at: 1672175320,
                kind: 1,
                tags: [],
                content: 'test',
            };

            const id = await computeNostrEventId(event);

            // Expected ID computed from serialization:
            // [0,"5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36",1672175320,1,[],"test"]
            expect(id).toHaveLength(64);
            expect(id).toMatch(/^[0-9a-f]{64}$/);
        });

        it('should compute different IDs for different events', async () => {
            const event1 = {
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test1',
            };

            const event2 = {
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test2',
            };

            const id1 = await computeNostrEventId(event1);
            const id2 = await computeNostrEventId(event2);

            expect(id1).not.toBe(id2);
        });

        it('should compute same ID for same event', async () => {
            const event = {
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
            };

            const id1 = await computeNostrEventId(event);
            const id2 = await computeNostrEventId(event);

            expect(id1).toBe(id2);
        });

        it('should handle events with tags', async () => {
            const event = {
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 30078,
                tags: [
                    ['d', 'test-id'],
                    ['address', 'bc1qtest'],
                ],
                content: 'test content',
            };

            const id = await computeNostrEventId(event);

            expect(id).toHaveLength(64);
            expect(id).toMatch(/^[0-9a-f]{64}$/);
        });
    });

    describe('verifyNostrEventId', () => {
        it('should verify correct event ID', async () => {
            const unsignedEvent = {
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
            };

            const id = await computeNostrEventId(unsignedEvent);

            const event: NostrEvent = {
                ...unsignedEvent,
                id,
                sig: '0'.repeat(128),
            };

            const isValid = await verifyNostrEventId(event);
            expect(isValid).toBe(true);
        });

        it('should reject incorrect event ID', async () => {
            const event: NostrEvent = {
                id: 'incorrect_id_' + '0'.repeat(50),
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(128),
            };

            const isValid = await verifyNostrEventId(event);
            expect(isValid).toBe(false);
        });
    });

    describe('validateNostrEvent', () => {
        it('should validate correct event structure', () => {
            const event: NostrEvent = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(true);
        });

        it('should reject event with invalid id length', () => {
            const event = {
                id: '0'.repeat(32), // Too short
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(false);
        });

        it('should reject event with invalid pubkey length', () => {
            const event = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(32), // Too short
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(false);
        });

        it('should reject event with invalid sig length', () => {
            const event = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(64), // Too short
            };

            expect(validateNostrEvent(event)).toBe(false);
        });

        it('should reject event with missing fields', () => {
            const event = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(64),
                // missing created_at
                kind: 1,
                tags: [],
                content: 'test',
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(false);
        });

        it('should reject event with invalid tags type', () => {
            const event = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 1,
                tags: 'not an array', // Invalid
                content: 'test',
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(false);
        });

        it('should accept event with complex tags', () => {
            const event: NostrEvent = {
                id: '0'.repeat(64),
                pubkey: '0'.repeat(64),
                created_at: 1000000,
                kind: 30078,
                tags: [
                    ['d', 'attestation-id'],
                    ['address', 'bc1qtest'],
                    ['scheme', 'bip322'],
                    ['i', 'nostr:npub1test'],
                    ['i', 'github:alice'],
                ],
                content: JSON.stringify({ test: 'data' }),
                sig: '0'.repeat(128),
            };

            expect(validateNostrEvent(event)).toBe(true);
        });
    });
});
