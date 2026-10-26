/**
 * A reason code's words, read from the table's own keys only: "constructor"
 * or "__proto__" is an unknown code.
 */
export function ownWord(table: Readonly<Record<string, string>>, code: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(table, code) ? table[code] : undefined;
}
