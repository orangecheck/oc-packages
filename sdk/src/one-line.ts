/** What no value holds: a C0 control, DEL, NEL, or a line or paragraph separator (SPEC §2.2, A.1). */
const NOT_IN_A_VALUE = /[\x00-\x1f\x7f\x85\u2028\u2029]/;
/** A UTF-16 surrogate without its partner, which an encoder writes as U+FFFD. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Whether `value` can be one value of a signed line (SPEC §2.2, Appendix A.1): no C0 control,
 * DEL, U+0085, U+2028 or U+2029, which a wallet may show as a line break, and no lone
 * surrogate, which would leave one signature covering two strings.
 */
export function isOneLineValue(value: string): boolean {
    return !NOT_IN_A_VALUE.test(value) && !LONE_SURROGATE.test(value);
}
