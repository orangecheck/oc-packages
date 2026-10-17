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
 * price per subtype. Every price is at the full user share, 0.8: the
 * user gets everything the 20% platform fee leaves. A smaller share only
 * returned part of the fee to the developer's own balance after it was
 * charged, so it cost more for nothing.
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
            'A subscription product: people sign up, sign in and sometimes pay for more. Pays them for signing up and coming back.',
        examples: ['notes app', 'project tracker', 'design editor'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1056),
                user_share_pct: 0.8,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(45),
                user_share_pct: 0.8,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.00609375),
                user_share_pct: 0.8,
            },
            payment_method_connected: {
                enabled: true,
                site_pays: FIXED(260),
                user_share_pct: 0.8,
            },
        },
    },
    {
        id: 'marketplace',
        label: 'marketplace',
        summary:
            'Buyers and sellers trade. Pays on payments, listings and new payment methods.',
        examples: ['checkout', 'handmade-goods market', 'ride-hailing'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1056),
                user_share_pct: 0.8,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(45),
                user_share_pct: 0.8,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.00609375),
                user_share_pct: 0.8,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(81),
                user_share_pct: 0.8,
            },
            payment_method_connected: {
                enabled: true,
                site_pays: FIXED(260),
                user_share_pct: 0.8,
            },
            attest_verification_at_gate: {
                enabled: true,
                site_pays: FIXED(227),
                user_share_pct: 0.8,
            },
        },
    },
    {
        id: 'content-platform',
        label: 'content platform',
        summary:
            'Posts, reviews, votes and comments. Pays for each meaningful action, and for signed reviews.',
        examples: ['forum', 'video host', 'newsletter'],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1137),
                user_share_pct: 0.8,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(49),
                user_share_pct: 0.8,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(87),
                user_share_pct: 0.8,
            },
            stamp_signing: {
                enabled: true,
                site_pays: FIXED(49),
                user_share_pct: 0.8,
            },
        },
    },
    {
        id: 'gaming',
        label: 'gaming',
        summary:
            'A game where actions carry value. Pays for playing, paying and settled pledges.',
        examples: [
            'on-chain prediction markets',
            'skill-staking tournaments',
            'multiplayer games',
        ],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1137),
                user_share_pct: 0.8,
            },
            session_creation: {
                enabled: true,
                site_pays: FIXED(49),
                user_share_pct: 0.8,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(87),
                user_share_pct: 0.8,
            },
            payment_authorization: {
                enabled: true,
                site_pays: PCT(0.004375),
                user_share_pct: 0.8,
            },
            pledge_resolution: {
                enabled: true,
                site_pays: PCT(0.00875),
                user_share_pct: 0.8,
            },
            attest_verification_at_gate: {
                enabled: true,
                site_pays: FIXED(245),
                user_share_pct: 0.8,
            },
        },
    },
    {
        id: 'agent-only',
        label: 'agent-only',
        summary:
            'AI agents act for people under a delegation. Sessions are off; delegations and the actions they allow carry the activity.',
        examples: [
            'AI assistant calling APIs on user behalf',
            'autonomous trading bot',
            'agent-driven customer support',
        ],
        events: {
            account_creation: {
                enabled: true,
                site_pays: FIXED(1056),
                user_share_pct: 0.8,
            },
            agent_delegation_issued: {
                enabled: true,
                site_pays: FIXED(260),
                user_share_pct: 0.8,
            },
            scoped_action_authorization: {
                enabled: true,
                site_pays: FIXED(81),
                user_share_pct: 0.8,
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
    user_share_pct: 0.8,
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
