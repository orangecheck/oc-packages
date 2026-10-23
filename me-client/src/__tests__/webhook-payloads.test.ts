import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
    FederationMigratingWebhookPayload,
    FederationMigrationCancelledWebhookPayload,
    FederationSuccessor,
    SystemWebhookPayload,
} from '../index';

/**
 * The two federation notices, as me.ochk.io sends them (its
 * migration-notices.ts): `{ kind, subtype, project_key }` plus the move.
 */

const migrating: unknown = JSON.parse(
    JSON.stringify({
        kind: 'oc-system-event',
        subtype: 'federation.migrating',
        project_key: 'pk_live_example',
        migration_id: 'mig_01',
        from: 'oc-me-v1',
        to: 'oc-me-v2',
        flip_not_before: '2026-11-07T12:00:00.000Z',
        successor: {
            slug: 'oc-me-v2',
            name: 'OC-Me Federation v2',
            threshold: '3-of-4',
            network: 'bitcoin',
            charter_hash: 'ab'.repeat(32),
            guardians: ['cd'.repeat(32)],
        },
    })
);
const cancelled: unknown = JSON.parse(
    JSON.stringify({
        kind: 'oc-system-event',
        subtype: 'federation.migration_cancelled',
        project_key: 'pk_live_example',
        migration_id: 'mig_01',
        from: 'oc-me-v1',
        to: 'oc-me-v2',
    })
);

describe('federation notices · typed payloads', () => {
    it('reads a move: where from, where to, when, and who guards the successor', () => {
        const p = migrating as SystemWebhookPayload;
        if (p.subtype !== 'federation.migrating') throw new Error('not a move');
        const m = p as FederationMigratingWebhookPayload;
        expect([m.migration_id, m.from, m.to]).toEqual(['mig_01', 'oc-me-v1', 'oc-me-v2']);
        expect(Date.parse(m.flip_not_before)).toBeGreaterThan(0);
        expect(m.successor.guardians).toHaveLength(1);
        expectTypeOf(m.subtype).toEqualTypeOf<'federation.migrating'>();
        expectTypeOf(m.successor).toEqualTypeOf<FederationSuccessor>();
        expectTypeOf(m.successor.threshold).toEqualTypeOf<string | null>();
        expectTypeOf(m.successor.charter_hash).toEqualTypeOf<string | null>();
        expectTypeOf(m).toMatchTypeOf<SystemWebhookPayload>();
    });

    it('reads a cancelled move, which carries no date and no successor', () => {
        const c = cancelled as FederationMigrationCancelledWebhookPayload;
        expect([c.subtype, c.migration_id, c.from, c.to]).toEqual([
            'federation.migration_cancelled',
            'mig_01',
            'oc-me-v1',
            'oc-me-v2',
        ]);
        expect('successor' in c).toBe(false);
        expectTypeOf(c.subtype).toEqualTypeOf<'federation.migration_cancelled'>();
        expectTypeOf(c).toMatchTypeOf<SystemWebhookPayload>();
    });
});
