/**
 * Component tests. Uses jsdom via vitest.config.ts + @testing-library/react.
 * Narrow focus — these are UI components, not the protocol core:
 *
 *   - OcBadge renders without blowing up and escapes user input (no XSS).
 *   - OcGate shows loading / fallback / children based on the check() result.
 *
 * SDK modules are mocked so tests run offline and deterministic.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({
    check: vi.fn(),
}));
// The badge imports computeScore/formatScore/getScoreColor from
// '@orangecheck/sdk/scoring' — mock that too so we don't need the full SDK
// resolved under tests.
vi.mock('@orangecheck/sdk/scoring', () => ({
    computeScore: (sats: number, days: number) =>
        Math.round(Math.log(1 + sats) * (1 + days / 30) * 100) / 100,
    formatScore: (n: number) => String(n),
    getScoreColor: () => '#F7931A',
}));

import { check } from '@orangecheck/sdk';

import { OcBadge } from '../badge';
import { OcGate } from '../gate';

beforeEach(() => {
    vi.mocked(check).mockReset();
});

afterEach(() => {
    // RTL v16 doesn't auto-cleanup under vitest without the globals flag —
    // do it explicitly so each render() starts with an empty DOM.
    cleanup();
    vi.restoreAllMocks();
});

describe('OcBadge', () => {
    it('renders without throwing on the common case', () => {
        const { container } = render(
            <OcBadge address="bc1qtest" sats={100_000} days={30} />
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('renders the address in truncated form', () => {
        render(<OcBadge address="bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" sats={1} days={1} />);
        // The shortAddr helper emits 8 chars + ellipsis + 6 chars — verify we
        // don't just dump the raw 42-char address into the DOM.
        expect(screen.queryByText(/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq/)).toBeNull();
    });

    it('escapes user-supplied strings — no HTML injection via address', () => {
        const hostile = '<script>alert(1)</script>';
        const { container } = render(
            <OcBadge address={hostile} sats={0} days={0} />
        );
        // The load-bearing check: React autoescapes, so zero actual script
        // elements make it into the DOM even when the address is hostile.
        expect(container.querySelectorAll('script')).toHaveLength(0);
        // Defence-in-depth: also verify no <script> HTML leaked into innerHTML
        // in any form (e.g., via dangerouslySetInnerHTML on some nested node).
        expect(container.innerHTML).not.toContain('<script>');
        expect(container.innerHTML).not.toContain('</script>');
    });

    it('card variant renders with the same data', () => {
        const { container } = render(
            <OcBadge address="bc1qtest" sats={100_000} days={30} variant="card" />
        );
        expect(container.firstChild).toBeTruthy();
    });

    it('hideScore suppresses the score line', () => {
        const { container: a } = render(<OcBadge address="bc1q" sats={1} days={1} />);
        const { container: b } = render(
            <OcBadge address="bc1q" sats={1} days={1} hideScore />
        );
        // Trivial — just check the with/without differ in content length.
        expect(a.textContent!.length).not.toBe(b.textContent!.length);
    });
});

describe('OcGate', () => {
    it('shows the loading element while the check is pending', async () => {
        let resolve: (r: { ok: boolean; sats: number; days: number; score: number }) => void;
        vi.mocked(check).mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r;
                })
        );

        render(
            <OcGate address="bc1qtest" loading={<span>loading…</span>}>
                <span>gated content</span>
            </OcGate>
        );

        expect(screen.queryByText('loading…')).toBeTruthy();
        expect(screen.queryByText('gated content')).toBeNull();

        await act(async () => {
            resolve!({ ok: true, sats: 100, days: 1, score: 4 });
        });
        await waitFor(() => {
            expect(screen.queryByText('gated content')).toBeTruthy();
        });
    });

    it('renders children when check() returns ok', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 100_000,
            days: 30,
            score: 23,
        } as never);

        render(
            <OcGate address="bc1qtest" minSats={100_000}>
                <span data-testid="ok">pass</span>
            </OcGate>
        );

        await waitFor(() => {
            expect(screen.queryByTestId('ok')).toBeTruthy();
        });
    });

    it('renders fallback when check() returns not-ok', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['not_found'],
        } as never);

        render(
            <OcGate
                address="bc1qtest"
                fallback={<span data-testid="fail">denied</span>}
            >
                <span>pass</span>
            </OcGate>
        );

        await waitFor(() => {
            expect(screen.queryByTestId('fail')).toBeTruthy();
        });
    });

    it('fallback as a function receives the failing CheckResult', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 10,
            days: 1,
            score: 2,
            reasons: ['below_min_sats'],
        } as never);

        render(
            <OcGate
                address="bc1qtest"
                minSats={1_000_000}
                fallback={(r) => <span data-testid="fail">reason: {r?.reasons?.[0]}</span>}
            >
                <span>pass</span>
            </OcGate>
        );

        await waitFor(() => {
            expect(screen.queryByTestId('fail')?.textContent).toContain('below_min_sats');
        });
    });

    it('renders fallback (not children) when check() throws', async () => {
        vi.mocked(check).mockRejectedValue(new Error('network down'));

        render(
            <OcGate address="bc1qtest" fallback={<span data-testid="err">err</span>}>
                <span>pass</span>
            </OcGate>
        );

        await waitFor(() => {
            expect(screen.queryByTestId('err')).toBeTruthy();
        });
    });
});
