import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { session } from '../session';
import type { Session, SessionPolicy } from '../types';

// me.ochk.io's answer to POST /api/session/create, field for field (oc-me-web
// src/pages/api/session/create.ts). Typed as Session, so a type that drifts
// from the server fails to compile here.
const SERVED: Session = {
    id: 'oc-sess-abc',
    identity: 'did:oc:0123456789abcdef0123456789abcdef',
    scope: ['identity'],
    policy: { duration_seconds: 604800, refresh: 'sliding', sensitive_actions: 're-auth' },
    issued_at: '2026-11-09T12:00:00.000Z',
    expires_at: '2026-11-16T12:00:00.000Z',
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Session is what me.ochk.io sends (R11 P1-2)', () => {
    it('names the fields the server sends, and only those', () => {
        expectTypeOf<keyof Session>().toEqualTypeOf<
            'id' | 'identity' | 'scope' | 'policy' | 'issued_at' | 'expires_at'
        >();
        expectTypeOf<Session['issued_at']>().toEqualTypeOf<string>();
    });

    it('takes the policy words the server takes', () => {
        expectTypeOf<SessionPolicy['refresh']>().toEqualTypeOf<'sliding' | 'rolling' | 'fixed'>();
        expectTypeOf<SessionPolicy['sensitive_actions']>().toEqualTypeOf<'re-auth' | 'allow' | undefined>();
    });

    it('create hands back the time the server opened it', async () => {
        vi.stubGlobal('fetch', async () => Response.json(SERVED));
        const s = await session.create({ scope: ['identity'] });
        expect(s.issued_at).toBe('2026-11-09T12:00:00.000Z');
    });
});
