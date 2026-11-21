/** A project's public side, from the four me.ochk.io endpoints that answer without a credential. */

import { getJson, UpstreamError, type FetchLike } from './http.js';

export const ME_ORIGIN = 'https://me.ochk.io';

/** The shape me.ochk.io gives project keys: pk_test_… or pk_live_…. */
export const PROJECT_KEY_RE = /^pk_(test|live)_[A-Za-z0-9_-]{1,128}$/;

export interface Part<T> {
    url: string;
    ok: boolean;
    status?: number;
    data?: T;
    /** Why this part is missing, in a sentence. */
    problem?: string;
}

export interface Identity {
    display_name: string;
    domain: string;
    verified: boolean;
    frozen: boolean;
    moved_from: { domain: string; at: string } | null;
}

/** me.ochk.io's BondRequirement (oc-me-web src/lib/events/types.ts). */
export interface BondRule {
    min_sats: number;
    min_days: number;
}

export interface NativeSignIn {
    enabled: boolean;
    name: string;
    audiences: string[];
}

export interface PublishedConfig {
    config: {
        project_key: string;
        display_name: string;
        domain: string;
        updated_at?: string;
        events?: Record<string, unknown>;
        [k: string]: unknown;
    };
    drops: unknown[];
    pay_periods: unknown[];
}

export interface ProjectReport {
    projectKey: string;
    mode: 'test' | 'live';
    identity: Part<Identity>;
    signIn: Part<{ require_bond: BondRule | null }>;
    native: Part<NativeSignIn>;
    config: Part<PublishedConfig>;
    /** True when me.ochk.io says no project has this key. */
    unknown: boolean;
}

const reasonOf = (body: unknown): string | undefined => {
    if (!body || typeof body !== 'object') return undefined;
    const b = body as { reason?: unknown; error?: unknown };
    return typeof b.reason === 'string' ? b.reason : typeof b.error === 'string' ? b.error : undefined;
};

async function part<T>(fetchImpl: FetchLike, url: string, pick: (body: Record<string, unknown>) => T): Promise<Part<T>> {
    try {
        const { status, body } = await getJson(fetchImpl, url, { timeoutMs: 10_000 });
        const ok = status === 200 && !!body && typeof body === 'object' && (body as { ok?: unknown }).ok === true;
        if (ok) return { url, ok: true, status, data: pick(body as Record<string, unknown>) };
        const reason = reasonOf(body);
        return { url, ok: false, status, problem: `${url} answered ${status}${reason ? ` ${reason}` : ''}.` };
    } catch (err) {
        if (err instanceof UpstreamError) return { url, ok: false, status: err.status, problem: err.message };
        throw err;
    }
}

export async function readProject(fetchImpl: FetchLike, projectKey: string, meOrigin = ME_ORIGIN): Promise<ProjectReport> {
    const key = projectKey.trim();
    if (!PROJECT_KEY_RE.test(key)) {
        throw new Error(
            `"${projectKey}" is not a project key. A key starts pk_test_ or pk_live_; it is on your project's Keys & webhooks tab at https://ochk.app/me/projects.`
        );
    }
    const k = encodeURIComponent(key);
    const [identity, signIn, native, config] = await Promise.all([
        part<Identity>(fetchImpl, `${meOrigin}/api/integrator/${k}/identity`, (b) => ({
            display_name: String(b.display_name ?? ''),
            domain: String(b.domain ?? ''),
            verified: b.verified === true,
            frozen: b.frozen === true,
            moved_from: (b.moved_from as Identity['moved_from']) ?? null,
        })),
        part(fetchImpl, `${meOrigin}/api/integrator/${k}/sign-in`, (b) => ({
            require_bond: (b.require_bond as BondRule | null) ?? null,
        })),
        part<NativeSignIn>(fetchImpl, `${meOrigin}/api/integrator/${k}/native`, (b) => ({
            enabled: b.enabled === true,
            name: String(b.name ?? ''),
            audiences: Array.isArray(b.audiences) ? b.audiences.map(String) : [],
        })),
        part<PublishedConfig>(fetchImpl, `${meOrigin}/api/integrator/config?project_key=${k}`, (b) => ({
            config: b.config as PublishedConfig['config'],
            drops: Array.isArray(b.drops) ? b.drops : [],
            pay_periods: Array.isArray(b.pay_periods) ? b.pay_periods : [],
        })),
    ]);
    const parts = [identity, signIn, native, config];
    const unknown = parts.every((p) => p.status === 404) || (identity.status === 404 && signIn.status === 404);
    return { projectKey: key, mode: key.startsWith('pk_live_') ? 'live' : 'test', identity, signIn, native, config, unknown };
}

const describeBond = (rule: BondRule | null): string =>
    rule
        ? `Backed by bitcoin: accounts backed by one coin of at least ${Number(rule.min_sats).toLocaleString('en-US')} sats, held at least ${rule.min_days} days. An account below it gets 403 bond_required with a back_url.`
        : 'Everyone: every orangecheck account (the default).';

const describePrice = (event: unknown): string => {
    if (!event || typeof event !== 'object') return JSON.stringify(event);
    const e = event as { enabled?: boolean; site_pays?: { kind?: string; sats?: number; pct?: number }; user_share_pct?: number; class?: string };
    const p = e.site_pays;
    const price =
        p?.kind === 'fixed_sats'
            ? `site pays ${p.sats} sats`
            : p?.kind === 'percent_of_amount'
              ? `site pays ${(Number(p.pct) * 100).toFixed(3).replace(/\.?0+$/, '')}% of the payment`
              : `site_pays ${JSON.stringify(p)}`;
    const share = typeof e.user_share_pct === 'number' ? `, user earns ${Math.round(e.user_share_pct * 100)}% of it` : '';
    return `${e.enabled === false ? 'off' : 'on'}: ${price}${share}`;
};

/** The report as text an agent can read and quote. */
export function formatProject(r: ProjectReport): string {
    if (r.unknown) {
        return [
            `No project has the key ${r.projectKey}: me.ochk.io answered 404 project_not_found.`,
            '',
            'Copy the key from your project at https://ochk.app/me/projects (its Keys & webhooks tab). Keys are pk_test_ for a test project and pk_live_ once it is live; a key from another account or a deleted project names nothing.',
        ].join('\n');
    }
    const out: string[] = [`# Project ${r.projectKey}`, ''];
    out.push(
        r.mode === 'test'
            ? 'Mode: test (pk_test_). A test project records events only for its owner; see https://ochk.io/docs/me/quickstart#1--when-you-pay.'
            : 'Mode: live (pk_live_).'
    );
    out.push('');
    out.push('## Identity');
    if (r.identity.ok && r.identity.data) {
        const i = r.identity.data;
        out.push(`- Name: ${i.display_name}`);
        out.push(`- Domain: ${i.domain}`);
        out.push(
            `- Domain verified: ${i.verified ? 'yes' : 'no. Until it is, the list of ended sessions is refused for it and the SDKs refuse writes from signed-in sessions (https://ochk.io/docs/me/quickstart#1--create-a-project).'}`
        );
        out.push(`- Frozen: ${i.frozen ? 'yes. A frozen project signs nobody in.' : 'no'}`);
        if (i.moved_from) out.push(`- Moved from: ${i.moved_from.domain} (until ${i.moved_from.at})`);
    } else out.push(`- Not read: ${r.identity.problem}`);
    out.push(`- Source: ${r.identity.url}`);
    out.push('');
    out.push('## Who can sign in');
    if (r.signIn.ok && r.signIn.data) out.push(`- ${describeBond(r.signIn.data.require_bond)}`);
    else out.push(`- Not read: ${r.signIn.problem}`);
    out.push(`- Source: ${r.signIn.url} (never cached; what withOcAuth enforces)`);
    out.push('- Docs: https://ochk.io/docs/me/require-bond');
    out.push('');
    out.push('## Sign in from apps (native)');
    if (r.native.ok && r.native.data) {
        const n = r.native.data;
        out.push(`- ${n.enabled ? 'On' : 'Off'}${n.name ? `, shown as "${n.name}"` : ''}`);
        out.push(`- Audiences: ${n.audiences.length ? n.audiences.join(', ') : 'none'}`);
    } else out.push(`- Not read: ${r.native.problem}`);
    out.push(`- Source: ${r.native.url}`);
    out.push('- Docs: https://ochk.io/docs/integration/native-sign-in#turn-it-on');
    out.push('');
    out.push('## Published config (prices, pay periods, release schedules)');
    if (r.config.ok && r.config.data) {
        const c = r.config.data;
        const events = Object.entries(c.config?.events ?? {});
        if (c.config?.updated_at) out.push(`- Updated: ${c.config.updated_at}`);
        out.push(`- Events (${events.length}):`);
        for (const [key, ev] of events) out.push(`  - ${key}: ${describePrice(ev)}`);
        out.push(`- Pay periods: ${c.pay_periods.length ? JSON.stringify(c.pay_periods) : 'none (not paying users)'}`);
        out.push(`- Release schedules (drops): ${c.drops.length ? JSON.stringify(c.drops) : 'none'}`);
        out.push('- This answer is cached at the edge and can be up to 70 minutes old (https://ochk.io/docs/me/api).');
    } else out.push(`- Not read: ${r.config.problem}`);
    out.push(`- Source: ${r.config.url}`);
    return out.join('\n');
}
