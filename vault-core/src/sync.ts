/**
 * The vault.ochk.io API client — transport only.
 *
 * Every endpoint deals in **ciphertext**: the escrowed (passphrase-wrapped)
 * key, and the double-encrypted entry blobs. Nothing here decrypts
 * anything — that is `crypto.ts`, client-side, with a key this layer never
 * sees.
 *
 * Auth is injectable: a browser caller passes `credentials: 'include'` to
 * ride the `oc_session` cookie; a headless caller passes an access `token`
 * (the `ocvt_…` bearer). An access token authorizes transport only — it
 * carries no key material (see VAULT-DEVELOPER-PLATFORM.md §1).
 */

import type { WrappedKey } from './crypto';

const DEFAULT_BASE_URL = 'https://vault.ochk.io';

/** Thrown on a 401 — the caller has no live session / valid token. */
export class NotSignedIn extends Error {
    constructor() {
        super('not signed in to vault.ochk.io');
        this.name = 'NotSignedIn';
    }
}

/** Thrown on a 402 — cloud sync is not paid for on this identity. */
export class SyncNotPaid extends Error {
    constructor() {
        super('cloud sync is not enabled for this account');
        this.name = 'SyncNotPaid';
    }
}

/** A change-manifest entry — an envelope id and when it last changed. */
export interface BlobRef {
    envelope_id: string;
    updated_at: string;
}

/** A blob ref paired with its fetched packed ciphertext. */
export interface FetchedBlob {
    envelope_id: string;
    updated_at: string;
    ciphertext: string;
}

export interface VaultClientOptions {
    /** API origin. Default `https://vault.ochk.io`. */
    baseUrl?: string;
    /** An `ocvt_…` access token — sent as `Authorization: Bearer`. */
    token?: string;
    /** Extra request headers. */
    headers?: Record<string, string>;
    /** Cookie mode — browser callers using the `oc_session` cookie pass `'include'`. */
    credentials?: RequestCredentials;
    /** Injectable `fetch`, for testing or non-standard runtimes. */
    fetch?: typeof fetch;
}

/** A thin, transport-agnostic client for the vault.ochk.io ciphertext API. */
export class VaultClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly extraHeaders: Record<string, string>;
    private readonly credentials?: RequestCredentials;
    private readonly doFetch: typeof fetch;

    constructor(opts: VaultClientOptions = {}) {
        this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        this.token = opts.token;
        this.extraHeaders = opts.headers ?? {};
        this.credentials = opts.credentials;
        const f = opts.fetch ?? globalThis.fetch;
        if (!f) {
            throw new Error('no fetch implementation — pass `fetch` in VaultClientOptions');
        }
        this.doFetch = f;
    }

    private async api<T>(path: string, init?: RequestInit): Promise<T> {
        const headers: Record<string, string> = { ...this.extraHeaders };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (init?.body) headers['Content-Type'] = 'application/json';

        let res: Response;
        try {
            res = await this.doFetch(`${this.baseUrl}${path}`, {
                ...init,
                headers: { ...headers, ...(init?.headers as Record<string, string>) },
                ...(this.credentials ? { credentials: this.credentials } : {}),
            });
        } catch (err) {
            throw new Error(`network error reaching vault.ochk.io: ${String(err)}`);
        }
        if (res.status === 401) throw new NotSignedIn();
        if (res.status === 402) throw new SyncNotPaid();
        const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            reason?: string;
        } & T;
        if (!res.ok || json.ok === false) {
            throw new Error(json.reason ?? `request failed · ${res.status}`);
        }
        return json;
    }

    /** The escrowed, passphrase-wrapped vault key, or null when no vault exists. */
    async fetchEscrow(): Promise<WrappedKey | null> {
        const { escrow } = await this.api<{ escrow: { passphrase: WrappedKey } | null }>(
            '/api/vault-key'
        );
        return escrow?.passphrase ?? null;
    }

    /** The signed-in OrangeCheck identity (`did:oc:…`), or null. */
    async fetchIdentity(): Promise<string | null> {
        try {
            const { account } = await this.api<{ account: { did_oc?: string } }>(
                '/api/auth/me'
            );
            return account?.did_oc ?? null;
        } catch {
            return null;
        }
    }

    /** The change manifest — envelope ids + timestamps, no ciphertext. */
    async listBlobs(): Promise<BlobRef[]> {
        const { blobs } = await this.api<{ blobs: BlobRef[] }>('/api/blobs');
        return blobs ?? [];
    }

    /** One blob's packed ciphertext, or null when it is gone. */
    async fetchBlob(envelopeId: string): Promise<string | null> {
        try {
            const { ciphertext } = await this.api<{ ciphertext: string }>(
                `/api/blobs/${encodeURIComponent(envelopeId)}`
            );
            return ciphertext ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Fetch many blobs with bounded concurrency — fast, but not a thundering
     * herd against the rate limiter. A blob that fails transiently is
     * omitted; the next sync re-fetches it.
     */
    async fetchBlobs(refs: BlobRef[], concurrency = 8): Promise<FetchedBlob[]> {
        const out: FetchedBlob[] = [];
        let cursor = 0;
        const worker = async (): Promise<void> => {
            while (cursor < refs.length) {
                const ref = refs[cursor++]!;
                const ciphertext = await this.fetchBlob(ref.envelope_id);
                if (ciphertext) {
                    out.push({
                        envelope_id: ref.envelope_id,
                        updated_at: ref.updated_at,
                        ciphertext,
                    });
                }
            }
        };
        await Promise.all(
            Array.from({ length: Math.min(concurrency, refs.length || 1) }, () => worker())
        );
        return out;
    }

    /** Upsert one blob's packed ciphertext. */
    async putBlob(envelopeId: string, ciphertext: string): Promise<void> {
        await this.api(`/api/blobs/${encodeURIComponent(envelopeId)}`, {
            method: 'PUT',
            body: JSON.stringify({ ciphertext }),
        });
    }

    /** Hard-delete one blob. */
    async deleteBlob(envelopeId: string): Promise<void> {
        await this.api(`/api/blobs/${encodeURIComponent(envelopeId)}`, {
            method: 'DELETE',
        });
    }
}
