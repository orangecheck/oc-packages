import recording from '../fixtures/me-email-account.json' with { type: 'json' };

/**
 * What me.ochk.io sends integrators about the same email account, once its ochk.io answers and
 * token carry the identity key (fixtures/me-email-account.json, from oc-me-web's own-keys
 * contract test, which names the commit). Each placement in ME_FORBIDDEN puts the custodial
 * address where §2 forbids it; a run with COMPAT_PLACEMENT set to one of those must fail.
 */

export interface MeSent {
    scopes_session: { sub: string; scopes_granted: string[]; scopes: Record<string, string> };
    scopes_backend: { sub: string; scopes_granted: string[]; scopes: Record<string, string> };
    webhook: { body: string; kid: string };
    popup: { family: Record<string, unknown>; other: Record<string, unknown> };
    attestation: { attestation: Record<string, unknown>; kid: string; canonical_b64: string };
}

export const me = recording as unknown as {
    recorded_from: { repo: string; base: string; test: string; ochk_io: Record<string, string> };
    project_key: string;
    identity_key: { address: string; nostr: string; key_holder: string };
    sent: MeSent;
};

const ADDRESS = me.identity_key.address;

/** The signed attestation's fields, rebuilt in the recorded order with one more after them. */
const withSignedField = (a: MeSent['attestation'], key: string, value: unknown) => {
    const signed = JSON.parse(Buffer.from(a.canonical_b64, 'base64').toString('utf8'));
    a.canonical_b64 = Buffer.from(JSON.stringify({ ...signed, [key]: value })).toString('base64');
};

export const ME_FORBIDDEN: Record<string, (s: MeSent) => void> = {
    me_scope_bitcoin_address: (s) => {
        s.scopes_session.scopes.bitcoin_address = ADDRESS;
        s.scopes_backend.scopes.bitcoin_address = ADDRESS;
    },
    me_webhook_bitcoin_address: (s) => {
        const body = JSON.parse(s.webhook.body);
        body.scopes = { ...body.scopes, bitcoin_address: ADDRESS };
        s.webhook.body = JSON.stringify(body);
    },
    me_popup_account_key: (s) => {
        s.popup.family.identity_key = structuredClone(me.identity_key);
        s.popup.other.identity_key = structuredClone(me.identity_key);
    },
    me_attestation_field: (s) => withSignedField(s.attestation, 'identity_key', ADDRESS),
};

const placement = process.env.COMPAT_PLACEMENT?.trim() || 'identity_key';

/** What me.ochk.io sent, with the address placed as COMPAT_PLACEMENT says (nowhere, by default). */
export const sent: MeSent = (() => {
    const s = structuredClone(me.sent);
    ME_FORBIDDEN[placement]?.(s);
    return s;
})();
