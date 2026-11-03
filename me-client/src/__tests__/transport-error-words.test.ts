import { afterEach, describe, expect, it, vi } from 'vitest';

import { MeClientError, api } from '../transport';

/** Answers the next fetch with `body` at `status`, as me.ochk.io does. */
function answer(status: number, body: unknown) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        })
    );
}

async function refusal(): Promise<MeClientError> {
    const err = await api('/api/integrator/event', { method: 'POST', body: {} }).catch(
        (e: unknown) => e
    );
    expect(err).toBeInstanceOf(MeClientError);
    return err as MeClientError;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('a refusal carries its words', () => {
    it("takes the event route's project_auth_required words from detail", async () => {
        const detail =
            'a user session is not proof that you are project pk_test_x. Sign the full batch body with the project signing secret';
        answer(401, { error: 'project_auth_required', detail });
        const err = await refusal();
        expect(err.status).toBe(401);
        expect(err.errorCode).toBe('project_auth_required');
        expect(err.message).toBe(detail);
    });

    it("takes a busy row's words from detail", async () => {
        const detail =
            'Another write kept changing this record, so nothing was written. Try again shortly.';
        answer(503, { ok: false, error: 'row_busy', detail });
        const err = await refusal();
        expect(err.status).toBe(503);
        expect(err.errorCode).toBe('row_busy');
        expect(err.message).toBe(detail);
    });

    it('still prefers reason, and falls back to the code when there are no words', async () => {
        answer(400, { error: 'invalid_request', reason: 'the reason', detail: 'the detail' });
        expect((await refusal()).message).toBe('the reason');
        answer(404, { error: 'project_not_found' });
        expect((await refusal()).message).toBe('project_not_found');
    });
});
