import type { CheckParams } from './check';
import type { VerifyOptions } from './types';

/** The options `check()` reads. */
const CHECK_OPTIONS: ReadonlySet<string> = new Set<keyof CheckParams>([
    'addr',
    'id',
    'identity',
    'minSats',
    'minDays',
    'relays',
    'verifyOptions',
]);

/** The options `verify()` reads. */
const VERIFY_OPTIONS: ReadonlySet<string> = new Set<keyof VerifyOptions>([
    'testMode',
    'demoMode',
    'expectedAud',
    'esploraMainnetBase',
    'esploraSignetBase',
    'esploraTestnetBase',
    'coverSats',
]);

/**
 * Throw on a key the SDK does not read. Ignored, a misspelt `minSats` would
 * leave the threshold at 0, and a misspelt `expectedAud` would skip the
 * audience check.
 */
function refuseUnknown(where: string, opts: unknown, known: ReadonlySet<string>): void {
    if (opts === null || typeof opts !== 'object') {
        throw new TypeError(`@orangecheck/sdk: ${where} must be an object`);
    }
    const unknown = Object.keys(opts).filter((k) => !known.has(k));
    if (unknown.length > 0) {
        throw new TypeError(
            `@orangecheck/sdk: ${where}: unknown option ${unknown.join(', ')}. ` +
                `It reads only ${[...known].join(', ')}.`
        );
    }
}

export function checkCheckParams(params: CheckParams): void {
    refuseUnknown('check()', params, CHECK_OPTIONS);
    if (params.verifyOptions !== undefined) checkVerifyOptions(params.verifyOptions, 'verifyOptions');
}

export function checkVerifyOptions(opts: VerifyOptions, where = 'verify()'): void {
    refuseUnknown(where, opts, VERIFY_OPTIONS);
}
