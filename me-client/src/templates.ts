/**
 * Archetype templates for `oc.config.fromTemplate(useCase, ...)`.
 *
 * A new integrator with a 30-second decision shouldn't have to fill
 * 12 IntegratorEventConfig entries by hand. Pick the archetype that
 * matches your site, get a sensible starting config, tweak whatever
 * you want, submit:
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const config = oc.config.fromTemplate('saas-paywall', {
 *     project_key: 'pk_live_yourcompany',
 *     domain: 'yoursite.com',
 *     display_name: 'Your Site',
 *   });
 *   await oc.config.save(config);
 *
 * Templates differ on which subtypes are enabled (a content platform
 * doesn't need payment_authorization; a marketplace does) and on the
 * sat price + user_share_pct per subtype. Every template's prices
 * anchor at $1 ≈ 1052 sats. user_share_pct=0.65 means the user gets
 * 65% of gross — the platform fee is 20% (fixed), the integrator
 * rebate is the remainder (15% with 0.65 user share).
 *
 * To customize after picking a template:
 *
 *   const config = oc.config.fromTemplate('marketplace', { ... });
 *   config.events.payment_authorization!.site_pays = {
 *     kind: 'percent_of_amount',
 *     pct: 0.005, // 0.5% instead of the template's 0.75%
 *   };
 */

import type {
    EventSubtype,
    IntegratorEventConfig,
    IntegratorPriceConfig,
} from './types';

export type IntegratorArchetype =
    | 'saas-paywall'
    | 'marketplace'
    | 'content-platform'
    | 'gaming'
    | 'agent-only';

interface ProjectIdentity {
    project_key: string;
    domain: string;
    display_name: string;
}

/** Template descriptor · what each archetype enables and prices.
 *  Exposed so dashboards can render "you're using the X template"
 *  state and offer one-click swaps. */
export interface ArchetypeTemplate {
    id: IntegratorArchetype;
    label: string;
    /** One-sentence summary shown next to the picker. */
    summary: string;
    /** Concrete examples of sites this archetype fits. */
    examples: readonly string[];
    /** Per-subtype config the template emits. Subtypes not listed are
     *  emitted as `enabled: false` (the SDK fills them with a
     *  conservative default to keep the type happy without firing). */
    events: Partial<Record<EventSubtype, IntegratorEventConfig>>;
}

const FIXED = (sats: number): IntegratorEventConfig['site_pays'] => ({
    kind: 'fixed_sats',
    sats,
});
const PCT = (pct: number): IntegratorEventConfig['site_pays'] => ({
    kind: 'percent_of_amount',
    pct,
});

/**
 * The full archetype catalog. Add new templates here · one record per
 * common integrator pattern. Keep the list curated (≤8 archetypes) —
 * if there are too many, none feel like the obvious default and
 * integrators stall on the picker.
 */
export const ARCHETYPE_TEMPLATES: readonly ArchetypeTemplate[] = [
    {
        id: 'saas-paywall',
        label: 'SaaS · paywall',
        summary:
            'Subscription product · users sign up, sign in, sometimes pay for premium tiers. Default cashback to encourage signup + retention.',
        examples: ['Notion-like notes app', 'Linear-like project tracker', 'Figma-like editor'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1300),
                user_share_pct: 0.65,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(55),
                user_share_pct: 0.65,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.0075),
                user_share_pct: 0.65,
            },
            payment_method_connected: {
                enabled: true,
                site_pays: FIXED(320),
                user_share_pct: 0.65,
            },
        },
    },
    {
        id: 'marketplace',
        label: 'marketplace',
        summary:
            'Two-sided marketplace · buyers + sellers transact. Heavy on payment_authorization and scoped_action_authorization for listings.',
        examples: ['Stripe-like checkout', 'Etsy-like marketplace', 'Uber-like ride-hailing'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1300),
                user_share_pct: 0.65,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(55),
                user_share_pct: 0.65,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.0075),
                user_share_pct: 0.65,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(100),
                user_share_pct: 0.65,
            },
            payment_method_connected: {
                enabled: true,
                site_pays: FIXED(320),
                user_share_pct: 0.65,
            },
            attest_verification_at_gate: {
                enabled: true,
                site_pays: FIXED(280),
                user_share_pct: 0.65,
            },
        },
    },
    {
        id: 'content-platform',
        label: 'content platform',
        summary:
            'User-generated content · posts, reviews, votes, comments. Each meaningful action is scoped_action_authorization; stamp_signing for credentialed reviews.',
        examples: ['Reddit-like forum', 'YouTube-like video host', 'Substack-like publishing'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1300),
                user_share_pct: 0.7,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(55),
                user_share_pct: 0.7,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(100),
                user_share_pct: 0.7,
            },
            stamp_signing: {
                enabled: true,
                site_pays: FIXED(55),
                user_share_pct: 0.7,
            },
        },
    },
    {
        id: 'gaming',
        label: 'gaming',
        summary:
            'Game with monetized actions · pledges + scoped actions are core. Higher cashback ratios reward in-game engagement.',
        examples: [
            'on-chain prediction markets',
            'skill-staking tournaments',
            'PvP wager games',
        ],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1300),
                user_share_pct: 0.7,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(55),
                user_share_pct: 0.7,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(100),
                user_share_pct: 0.7,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.005),
                user_share_pct: 0.7,
            },
            pledge_resolution: {
                enabled: true,
                site_pays: PCT(0.01),
                user_share_pct: 0.7,
            },
            attest_verification_at_gate: {
                enabled: true,
                site_pays: FIXED(280),
                user_share_pct: 0.7,
            },
        },
    },
    {
        id: 'agent-only',
        label: 'agent-only',
        summary:
            'AI-agent surface · oc-agent delegations are the primary auth pattern. Session_creation off (delegations replace sessions); agent_delegation_issued + scoped_action_authorization carry the activity.',
        examples: [
            'AI assistant calling APIs on user behalf',
            'autonomous trading bot',
            'agent-driven customer support',
        ],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1300),
                user_share_pct: 0.65,
            },
            agent_delegation_issued: {
                enabled: true,
                site_pays: FIXED(320),
                user_share_pct: 0.65,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(100),
                user_share_pct: 0.65,
            },
        },
    },
];

const ARCHETYPES_BY_ID: Record<IntegratorArchetype, ArchetypeTemplate> = Object.fromEntries(
    ARCHETYPE_TEMPLATES.map((t) => [t.id, t])
) as Record<IntegratorArchetype, ArchetypeTemplate>;

/** All 12 subtypes — used to fill `enabled: false` defaults for any
 *  subtype the chosen archetype doesn't list. */
const ALL_SUBTYPES: readonly EventSubtype[] = [
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

const DEFAULT_DISABLED: IntegratorEventConfig = {
    enabled: false,
    site_pays: { kind: 'fixed_sats', sats: 100 },
    user_share_pct: 0.65,
};

/**
 * Build a complete IntegratorPriceConfig from an archetype id + the
 * project's identity fields. Every subtype gets an entry — the
 * archetype's listed subtypes get the template's pricing; everything
 * else gets `enabled: false` with conservative defaults so the config
 * is type-complete and the integrator can flip-on later subtypes
 * without re-deriving prices.
 *
 * Throws synchronously if `useCase` isn't a known archetype id.
 */
export function fromTemplate(
    useCase: IntegratorArchetype,
    identity: ProjectIdentity
): IntegratorPriceConfig {
    const template = ARCHETYPES_BY_ID[useCase];
    if (!template) {
        throw new Error(
            `oc.config.fromTemplate: unknown archetype "${useCase}". Valid: ${Object.keys(
                ARCHETYPES_BY_ID
            ).join(', ')}`
        );
    }
    const events: IntegratorPriceConfig['events'] = {};
    for (const sub of ALL_SUBTYPES) {
        events[sub] = template.events[sub] ?? DEFAULT_DISABLED;
    }
    return {
        project_key: identity.project_key,
        domain: identity.domain,
        display_name: identity.display_name,
        updated_at: new Date().toISOString(),
        events,
    };
}

/** Look up a template's metadata · used by config-editor UIs to render
 *  "you're on the X template · here's what it enables" copy. */
export function getArchetypeTemplate(id: IntegratorArchetype): ArchetypeTemplate {
    return ARCHETYPES_BY_ID[id];
}
