import recording from '../fixtures/email-account.json' with { type: 'json' };

import { RECORD_FORBIDDEN } from './records.ts';

/**
 * The recorded email account (fixtures/email-account.json, from oc-www's own-keys contract
 * test), and the same account carrying an identity key that orangecheck holds.
 *
 * `identity_key` is the plan's new optional field (ME-OWN-KEYS-PLAN §2). Every other
 * placement below puts the custodial address where §2 forbids it. A run with
 * COMPAT_PLACEMENT set to one of those must fail, which is how mutants.mjs proves each
 * test reads what it claims to.
 */

export interface Recording {
    recorded_from: { repo: string; base: string; test: string };
    token_header: Record<string, unknown>;
    token_claims: Record<string, unknown>;
    audience_token_header: Record<string, unknown>;
    audience_token_claims: Record<string, unknown>;
    me: { ok: true; account: Record<string, unknown> } & Record<string, unknown>;
    identities: { ok: true; linked: Array<Record<string, unknown>> } & Record<string, unknown>;
    chat_vouch: {
        request: { device_pk: string; nostr_pk: string; device_id: string };
        header: Record<string, unknown>;
        statement: string;
    };
}

export const recorded = recording as unknown as Recording;

/** The address and Nostr key of keys-v1 vector kr01, a custodial binding. */
export const IDENTITY_KEY = {
    address: 'bc1q2t7hhwrqwv8s2yqqlfstrljy3eg7j9sy6lkwdx',
    nostr: 'c3f01bce700cc500773357a9f19917d1d9bd786a99f44f2033c0a0d3441c9574',
    key_holder: 'orangecheck',
} as const;

export const EMAIL = (recorded.identities.linked[0] as { value: string }).value;
export const AUDIENCE = recorded.audience_token_claims.aud as string;

type Account = Pick<Recording, 'token_claims' | 'audience_token_claims' | 'me' | 'identities' | 'chat_vouch'>;

const copy = <T>(v: T): T => structuredClone(v);

/**
 * The plan's placement: a new optional field in each answer and token, nothing else. The chat
 * vouch is a byte-exact statement, so it gets nothing.
 */
function withIdentityKey(a: Account): Account {
    a.token_claims.identity_key = copy(IDENTITY_KEY);
    a.audience_token_claims.identity_key = copy(IDENTITY_KEY);
    a.me.account.identity_key = copy(IDENTITY_KEY);
    a.identities.identity_key = copy(IDENTITY_KEY);
    return a;
}

const tokens = (a: Account, f: (claims: Record<string, unknown>) => void) => {
    f(a.token_claims);
    f(a.audience_token_claims);
};

/** Where §2 forbids the custodial address, each applied on top of the plan's placement. */
export const FORBIDDEN: Record<string, (a: Account) => void> = {
    amr_bip322: (a) => tokens(a, (c) => void (c.amr = [...(c.amr as string[]), 'bip322'])),
    amr_new_method: (a) => tokens(a, (c) => void (c.amr = [...(c.amr as string[]), 'custodial'])),
    signing_method_bip322: (a) => tokens(a, (c) => void (c.signing_method = 'bip322')),
    signing_method_new: (a) => tokens(a, (c) => void (c.signing_method = 'custodial')),
    display_identity_btc: (a) =>
        tokens(a, (c) => void (c.display_identity = { kind: 'btc', value: IDENTITY_KEY.address })),
    me_primary_btc: (a) => void (a.me.account.primary_btc = IDENTITY_KEY.address),
    me_signing_method_bip322: (a) => void (a.me.account.signing_method = 'bip322'),
    me_display_identity_btc: (a) =>
        void (a.me.account.display_identity = { kind: 'btc', value: IDENTITY_KEY.address }),
    btc_row: (a) =>
        void a.identities.linked.push({
            id: '00000000-0000-4000-8000-00000000b7c0',
            kind: 'btc',
            value: IDENTITY_KEY.address,
            verified_at: a.identities.created_at,
            verification_method: 'bip322',
            is_primary: true,
            providers: [],
        }),
    chat_vouch_line: (a) =>
        void (a.chat_vouch.statement = a.chat_vouch.statement.replace(
            /^issued_at: /m,
            `identity_key: ${IDENTITY_KEY.address}\nissued_at: `
        )),
};

export const placement = process.env.COMPAT_PLACEMENT?.trim() || 'identity_key';
if (placement !== 'identity_key' && !(placement in FORBIDDEN) && !(placement in RECORD_FORBIDDEN)) {
    const known = [...Object.keys(FORBIDDEN), ...Object.keys(RECORD_FORBIDDEN)];
    throw new Error(`COMPAT_PLACEMENT=${placement}: not identity_key or one of ${known}`);
}

function base(): Account {
    return {
        token_claims: copy(recorded.token_claims),
        audience_token_claims: copy(recorded.audience_token_claims),
        me: copy(recorded.me),
        identities: copy(recorded.identities),
        chat_vouch: copy(recorded.chat_vouch),
    };
}

/** The account as recorded, with no identity key. */
export const plain: Account = base();

/** The account with its identity key, placed as COMPAT_PLACEMENT says (the plan's, by default). */
export const keyed: Account = (() => {
    const a = withIdentityKey(base());
    FORBIDDEN[placement]?.(a);
    return a;
})();

/** `v` without the new field, for comparing what an old reader returns with what it returned before. */
export function withoutIdentityKey<T extends Record<string, unknown>>(v: T): Omit<T, 'identity_key'> {
    const { identity_key: _dropped, ...rest } = v;
    return rest;
}
