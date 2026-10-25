/** The known keys `opts` holds only through its prototype, which a reader would take as the caller's. */
export function inheritedKeys(opts: object, known: Iterable<string>): string[] {
    return [...known].filter((k) => k in opts && !Object.prototype.hasOwnProperty.call(opts, k));
}
