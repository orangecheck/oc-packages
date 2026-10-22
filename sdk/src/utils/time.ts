const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An RFC 3339 date-time as epoch milliseconds, or null when it is not one. */
export function rfc3339Ms(value: string | undefined): number | null {
    if (!value || !RFC3339.test(value)) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}
