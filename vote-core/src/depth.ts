// SPEC §7: a poll, ballot or reveal nests at most MAX_NESTING_DEPTH levels of
// objects and arrays, the object itself being level 1. One nested deeper is
// malformed. Walked without recursion, so no value can overflow the stack.

/** The most levels of objects and arrays a poll, ballot or reveal may nest (SPEC §7). */
export const MAX_NESTING_DEPTH = 32;

/** Whether `value` nests objects or arrays more than `max` levels deep; a scalar nests none. */
export function nestedTooDeep(value: unknown, max: number = MAX_NESTING_DEPTH): boolean {
    const stack: Array<[unknown, number]> = [[value, 1]];
    while (stack.length > 0) {
        const [v, level] = stack.pop()!;
        if (typeof v !== 'object' || v === null) continue;
        if (level > max) return true;
        for (const child of Object.values(v)) stack.push([child, level + 1]);
    }
    return false;
}
