// @vitest-environment jsdom
// OcPoll after a failed refresh: the question and deadline stay, since they
// name the poll; the error sits in the status pill and the body; and nothing
// it can't vouch for (a voter count, a ballot link) stands beside the error.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcPoll } from './poll.js';
import type { TallyResponse } from './types.js';

const A = 'cd'.repeat(32);
const B = 'ef'.repeat(32);
const REASON = 'not counted: the ballot lookup was cut short on relay.ochk.io';
const closed: TallyResponse = {
    poll_id: A,
    state: 'tallied',
    question: 'Ship the relay swap?',
    deadline: '2026-10-01T00:00:00Z',
    tallies: { yes: 3, no: 1 },
    turnout: { voters: 4, weight: 4 },
};
const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const refused = () => vi.fn().mockResolvedValue(answer(503, { poll_id: A, error: REASON }));

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('OcPoll', () => {
    it('keeps the question as the heading when a refresh fails, and puts the error in the pill', async () => {
        vi.stubGlobal('fetch', refused());
        render(<OcPoll pollId={A} initialData={closed} refreshMs={0} />);
        await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
        const heading = screen.getByText('Ship the relay swap?');
        expect(heading.textContent).not.toContain(REASON);
        const pill = screen.getByText('error');
        expect(pill.getAttribute('title')).toBe(REASON);
        expect(pill.getAttribute('aria-label')).toBe(`error: ${REASON}`);
    });

    it('shows no voter count and no ballot link it cannot vouch for, but keeps the deadline', async () => {
        vi.stubGlobal('fetch', refused());
        const { container } = render(<OcPoll pollId={A} initialData={closed} refreshMs={0} />);
        await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
        expect(container.textContent).not.toMatch(/\d+ voters/);
        expect(container.textContent).toContain('closed 2026-10-01 00:00');
        expect(screen.queryByText('cast a ballot →')).toBeNull();
    });

    it('offers no ballot link while the deadline is unknown', async () => {
        vi.stubGlobal('fetch', refused());
        render(<OcPoll pollId={A} refreshMs={0} />);
        await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
        expect(screen.queryByText('cast a ballot →')).toBeNull();
    });

    it("never shows one poll's question under another poll's id", async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(answer(200, closed))
                .mockResolvedValue(answer(503, { poll_id: B, error: REASON }))
        );
        const { rerender } = render(<OcPoll pollId={A} refreshMs={0} />);
        await waitFor(() => expect(screen.getByText('Ship the relay swap?')).toBeTruthy());
        rerender(<OcPoll pollId={B} refreshMs={0} />);
        await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
        expect(screen.queryByText('Ship the relay swap?')).toBeNull();
    });
});
