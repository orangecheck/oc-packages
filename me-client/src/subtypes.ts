/**
 * Rich metadata for every billable event subtype.
 *
 * The SDK already exports the `EventSubtype` union (closed enum, type-
 * checked), but a new integrator picking between
 * `'scoped_action_authorization'` and `'stamp_signing'` and
 * `'attest_verification_at_gate'` has no inline guidance on which fits
 * their flow. This file is the canonical "when do I use this subtype"
 * reference, programmatically accessible:
 *
 *   import { oc, EVENT_SUBTYPES } from '@orangecheck/me-client';
 *
 *   for (const meta of Object.values(EVENT_SUBTYPES)) {
 *     console.log(`${meta.id} (class ${meta.class}) — ${meta.fires_when}`);
 *   }
 *
 * Or per-subtype:
 *
 *   const meta = EVENT_SUBTYPES.account_creation;
 *   console.log(meta.example);  // → "user signed up via email-OTP and the account row was inserted"
 *
 * Used by `oc.config.fromTemplate()` to assemble archetype configs and
 * by /me/projects/* dashboards to drive consent prompts and config
 * editor labels from a single source.
 */

import type { EventClass, EventSubtype } from './types';

export interface EventSubtypeMetadata {
    id: EventSubtype;
    class: EventClass;
    /** Short label · matches SUBTYPE_LABELS on the server. */
    label: string;
    /** When this fires · imperative-mood plain English. The integrator
     *  reads this to know which event in their codebase should call
     *  `oc.event.fire()` with this subtype. */
    fires_when: string;
    /** A concrete example from a typical SaaS · helps integrators map
     *  an unfamiliar subtype name to a real flow they recognize. */
    example: string;
    /** Common use cases · lets integrators search their own product
     *  for matching flows. Two-three terms each, lowercase. */
    common_use_cases: readonly string[];
    /** What an integrator typically pays for this subtype, anchored at
     *  $1 ≈ 1052 sats. Returns null for percent-of-amount subtypes
     *  where the price scales with the underlying transaction. */
    typical_price_hint: string;
}

export const EVENT_SUBTYPES: Record<EventSubtype, EventSubtypeMetadata> = {
    // ── Class A · durable state transitions ──
    account_creation: {
        id: 'account_creation',
        class: 'A',
        label: 'account creation',
        fires_when:
            'a new oc identity creates a durable account record on your surface (first sign-in, profile row inserted)',
        example: 'user signed up via email-OTP and your account row was inserted in your DB',
        common_use_cases: ['onboarding', 'signup', 'registration', 'first-login'],
        typical_price_hint: '~1300 sats (~$1.24)',
    },
    account_recovery: {
        id: 'account_recovery',
        class: 'A',
        label: 'account recovery',
        fires_when:
            'a user re-binds an existing account to a new device or recovery method',
        example: 'user lost their device and recovered the account via email OTP + recovery code',
        common_use_cases: ['recovery', 'device-rebind', 'restore-access'],
        typical_price_hint: '~650 sats (~$0.62)',
    },
    attest_bond_increased: {
        id: 'attest_bond_increased',
        class: 'A',
        label: 'attest bond increased',
        fires_when:
            'a user upgrades their bond size (locks more sats to attest_tier=bonded with higher cap)',
        example: 'user moved from 10k-sat bond to 100k-sat bond to clear your higher-trust gate',
        common_use_cases: ['bond-upgrade', 'tier-promotion', 'sybil-resistance'],
        typical_price_hint: '~1600 sats (~$1.52) · OFF by default',
    },
    payment_method_connected: {
        id: 'payment_method_connected',
        class: 'A',
        label: 'payment method connected',
        fires_when:
            'a user connects a Lightning address, BIP-322 wallet, or payment-routing channel to their account',
        example: 'user pasted a lightning@address.com receive address into their profile',
        common_use_cases: ['payment-setup', 'wallet-connect', 'payout-config'],
        typical_price_hint: '~320 sats (~$0.30)',
    },
    agent_delegation_issued: {
        id: 'agent_delegation_issued',
        class: 'A',
        label: 'agent delegation issued',
        fires_when:
            'a user signs an oc-agent delegation envelope authorizing an AI agent to act on their behalf',
        example: 'user delegated a "summarize my emails" agent for 24 hours with scope email:read',
        common_use_cases: ['agent-grant', 'ai-delegation', 'scoped-authorization'],
        typical_price_hint: '~320 sats · OFF by default (power-user)',
    },
    recovery_method_updated: {
        id: 'recovery_method_updated',
        class: 'A',
        label: 'recovery method updated',
        fires_when:
            'a user changes their recovery email, recovery key, or social-recovery contacts',
        example: 'user rotated their recovery email after a phone change',
        common_use_cases: ['recovery-rotation', 'security-update'],
        typical_price_hint: '~160 sats (~$0.15)',
    },

    // ── Class B · action-bound ──
    payment_authorization: {
        id: 'payment_authorization',
        class: 'B',
        label: 'payment authorized',
        fires_when:
            'a user authorizes a payment of underlying value (Lightning, on-chain BTC, or fiat-quoted)',
        example: 'user paid $5.00 (≈5260 sats) for a premium feature on your site',
        common_use_cases: ['payment', 'checkout', 'paywall', 'subscription'],
        typical_price_hint: '0.75% of payment amount (percent_of_amount)',
    },
    scoped_action_authorization: {
        id: 'scoped_action_authorization',
        class: 'B',
        label: 'scoped action authorized',
        fires_when:
            'a user takes a specific action your site bills on (post, vote, comment, claim) where each instance is meaningful',
        example: 'user posted a long-form review that earns them sats from your editorial budget',
        common_use_cases: ['post', 'vote', 'comment', 'claim', 'submit'],
        typical_price_hint: '~100 sats (~$0.10)',
    },
    attest_verification_at_gate: {
        id: 'attest_verification_at_gate',
        class: 'B',
        label: 'attest verification',
        fires_when:
            "your site's gate consulted the user's attest_tier and admitted them (counted only when admitted)",
        example: 'admin gate checked attest_tier=bonded with bond≥10k sats and granted access',
        common_use_cases: ['gate-check', 'tier-gate', 'sybil-filter'],
        typical_price_hint: '~280 sats (~$0.27) · OFF by default',
    },
    stamp_signing: {
        id: 'stamp_signing',
        class: 'B',
        label: 'stamp signed',
        fires_when:
            'a user signs an oc-stamp envelope (provenance attestation, review credential, content stamp)',
        example: 'user stamped their published recipe with their oc identity for downstream verification',
        common_use_cases: ['provenance', 'review', 'credential', 'attestation'],
        typical_price_hint: '~55 sats (~$0.05) · OFF by default',
    },
    pledge_resolution: {
        id: 'pledge_resolution',
        class: 'B',
        label: 'pledge resolved',
        fires_when:
            'an oc-pledge bonded commitment resolves (paid out, slashed, or refunded) on your surface',
        example: 'user staked 50k sats on a prediction; market resolved and the pledge paid out',
        common_use_cases: ['pledge', 'staking', 'resolution', 'commit-reveal'],
        typical_price_hint: '1% of pledge amount (percent_of_amount) · OFF by default',
    },

    // ── Class C · session ──
    session_creation: {
        id: 'session_creation',
        class: 'C',
        label: 'session opened',
        fires_when:
            'a fresh authenticated session is opened for a returning user (sign-in within an existing session is FREE)',
        example: 'user signed in after their last session expired; new session token issued',
        common_use_cases: ['sign-in', 'session', 'authenticate'],
        typical_price_hint: '~55 sats (~$0.05)',
    },
};

/** All subtypes for a given class · convenience accessor. */
export function subtypesForClass(cls: EventClass): EventSubtypeMetadata[] {
    return Object.values(EVENT_SUBTYPES).filter((m) => m.class === cls);
}

/** All subtypes as a flat list, ordered class A → B → C. */
export const ALL_EVENT_SUBTYPES: readonly EventSubtypeMetadata[] = [
    ...subtypesForClass('A'),
    ...subtypesForClass('B'),
    ...subtypesForClass('C'),
];
