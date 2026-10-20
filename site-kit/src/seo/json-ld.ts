/**
 * JSON for an inline `<script type="application/ld+json">`.
 *
 * `<`, `>` and `&` become `\u003c`, `\u003e` and `\u0026`, so no value can close
 * the script, open a comment, or start an entity. U+2028 and U+2029 are escaped
 * too. The result parses to exactly the input value.
 */
export function jsonLd(data: unknown): string {
    const json = JSON.stringify(data);
    if (json === undefined) throw new TypeError('jsonLd: value is not serialisable to JSON');
    return json.replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
