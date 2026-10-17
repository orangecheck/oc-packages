/**
 * When a project pays its users. Paying is optional: a project may pay
 * always, only in promos, or never. A pay period is a stretch of time in
 * which its events earn its users sats; outside every period an event earns
 * and costs nothing, and me.ochk.io records nothing.
 *
 * GET /api/integrator/config returns a project's `pay_periods`, past ones
 * included. Periods that have started never change, so any earning can be
 * checked against the period that paid it. Mirrors me.ochk.io's
 * lib/events/pay-periods.ts.
 */

export interface PayPeriod {
    id: string;
    /** A promo's name ("Launch week"); empty for plain paying. */
    name: string;
    /** When paying starts, ISO-8601 UTC. */
    starts_at: string;
    /** When it stops, or null: until the project turns it off. */
    ends_at: string | null;
}

/** Where a project stands at a moment. */
export type PayingState =
    | { paying: true; period: PayPeriod }
    | { paying: false; next: PayPeriod | null };

const ms = (iso: string): number => Date.parse(iso);

/** Paying at `at`, and in which period; or not, and the next period if any. */
export function payingAt(periods: readonly PayPeriod[], at: Date = new Date()): PayingState {
    const t = at.getTime();
    const current = periods.find(
        (p) => ms(p.starts_at) <= t && (p.ends_at === null || t < ms(p.ends_at))
    );
    if (current) return { paying: true, period: current };
    const next = periods
        .filter((p) => ms(p.starts_at) > t)
        .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0];
    return { paying: false, next: next ?? null };
}
