import { describe, expect, it } from 'vitest';

import {
    ARCHETYPE_TEMPLATES,
    fromTemplate,
    getArchetypeTemplate,
    type IntegratorArchetype,
} from '../templates';
import { validateIntegratorConfig } from '../types';

const IDENTITY = {
    project_key: 'pk_test_co',
    domain: 'test.co',
    display_name: 'Test Co',
};

describe('config.fromTemplate', () => {
    const archetypes: IntegratorArchetype[] = [
        'saas-paywall',
        'marketplace',
        'content-platform',
        'gaming',
        'agent-only',
    ];

    it.each(archetypes)('emits a complete config for %s', (id) => {
        const cfg = fromTemplate(id, IDENTITY);
        expect(cfg.project_key).toBe('pk_test_co');
        expect(cfg.domain).toBe('test.co');
        expect(cfg.display_name).toBe('Test Co');
        expect(cfg.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it.each(archetypes)('every event subtype is present in %s output', (id) => {
        const cfg = fromTemplate(id, IDENTITY);
        const expectedSubtypes = [
            'account_creation',
            'account_recovery',
            'attest_bond_increased',
            'payment_method_connected',
            'agent_delegation_issued',
            'recovery_method_updated',
            'payment_authorization',
            'scoped_action_authorization',
            'attest_verification_at_gate',
            'stamp_signing',
            'pledge_resolution',
            'session_creation',
        ];
        for (const sub of expectedSubtypes) {
            expect(cfg.events[sub as keyof typeof cfg.events]).toBeDefined();
        }
    });

    it.each(archetypes)('every emitted config passes validateIntegratorConfig (%s)', (id) => {
        const cfg = fromTemplate(id, IDENTITY);
        const result = validateIntegratorConfig(cfg);
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('throws on unknown archetype id', () => {
        // @ts-expect-error · invalid id
        expect(() => fromTemplate('not-a-real-template', IDENTITY)).toThrow(/unknown archetype/);
    });

    it('saas-paywall enables account_creation + session + payment_authorization', () => {
        const cfg = fromTemplate('saas-paywall', IDENTITY);
        expect(cfg.events.account_creation?.enabled).toBe(true);
        expect(cfg.events.session_creation?.enabled).toBe(true);
        expect(cfg.events.payment_authorization?.enabled).toBe(true);
        expect(cfg.events.payment_authorization?.site_pays.kind).toBe('percent_of_amount');
    });

    it('agent-only enables agent_delegation_issued and disables session_creation', () => {
        const cfg = fromTemplate('agent-only', IDENTITY);
        expect(cfg.events.agent_delegation_issued?.enabled).toBe(true);
        expect(cfg.events.session_creation?.enabled).toBe(false);
    });

    it('marketplace enables payment + scoped_action + attest gate', () => {
        const cfg = fromTemplate('marketplace', IDENTITY);
        expect(cfg.events.payment_authorization?.enabled).toBe(true);
        expect(cfg.events.scoped_action_authorization?.enabled).toBe(true);
        expect(cfg.events.attest_verification_at_gate?.enabled).toBe(true);
    });

    it('content-platform enables stamp_signing', () => {
        const cfg = fromTemplate('content-platform', IDENTITY);
        expect(cfg.events.stamp_signing?.enabled).toBe(true);
    });

    it('gaming enables pledge_resolution + scoped_action', () => {
        const cfg = fromTemplate('gaming', IDENTITY);
        expect(cfg.events.pledge_resolution?.enabled).toBe(true);
        expect(cfg.events.pledge_resolution?.site_pays.kind).toBe('percent_of_amount');
        expect(cfg.events.scoped_action_authorization?.enabled).toBe(true);
    });
});

describe('getArchetypeTemplate', () => {
    it('returns the template descriptor with id, label, summary, examples', () => {
        const t = getArchetypeTemplate('saas-paywall');
        expect(t.id).toBe('saas-paywall');
        expect(t.label).toBe('SaaS · paywall');
        expect(t.summary).toMatch(/subscription/i);
        expect(t.examples.length).toBeGreaterThan(0);
    });
});

describe('ARCHETYPE_TEMPLATES catalog', () => {
    it('exposes 5 templates', () => {
        expect(ARCHETYPE_TEMPLATES.length).toBe(5);
    });

    it('every id is unique', () => {
        const ids = ARCHETYPE_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every template has at least one enabled subtype', () => {
        for (const t of ARCHETYPE_TEMPLATES) {
            const enabled = Object.values(t.events).filter((e) => e?.enabled);
            expect(enabled.length).toBeGreaterThan(0);
        }
    });
});
