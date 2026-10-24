/**
 * Where to send someone back to after they sign in or prove it is them again: a
 * path on your own site, or `fallback`. Refuses anything a browser would take
 * to another site (`//evil.com`, `/\evil.com`, a scheme), a backslash anywhere,
 * control characters (browsers drop some: `/\t/evil.com` becomes `//evil.com`),
 * a percent that does not decode, and dot segments, plain or percent-encoded,
 * which can collapse into `//`. sdk-py's
 * `safe_return_path` answers the same for every input in
 * test-vectors/return-path.json.
 */
export function safeReturnPath(raw: unknown, fallback = '/'): string {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
    if (/[\u0000-\u001f\u007f-\u009f\\]/.test(raw)) return fallback;
    try {
        decodeURIComponent(raw);
    } catch {
        return fallback; // a stray %, or bytes that are not UTF-8
    }
    const segments = raw.split(/[?#]/, 1)[0]!.split('/');
    if (segments.some((s) => /^(\.|%2e){1,2}$/i.test(s))) return fallback;
    // Returned as given, so sdk-py answers byte for byte the same; the parse only confirms it.
    try {
        return new URL(raw, 'https://site.invalid').origin === 'https://site.invalid' ? raw : fallback;
    } catch {
        return fallback;
    }
}
