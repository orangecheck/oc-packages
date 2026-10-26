#!/usr/bin/env node
/*
 * ./format's failure sentences: a request with no answer names who did not
 * answer and says what to do; library text, codes, status numbers and the
 * browser's own words never come through. Run after `yarn build`.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(pkg, 'dist/format.mjs'))) {
    console.error('✗ format: dist/format.mjs is missing; run yarn build first');
    process.exit(1);
}
const F = await import(join(pkg, 'dist/format.mjs'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ format: ${msg}`);
        failures++;
    }
};
if (typeof F.failureText !== 'function' || typeof F.OFFLINE_TEXT !== 'string') {
    console.error('✗ format: failureText or OFFLINE_TEXT is not exported');
    process.exit(1);
}
const { failureText: say, OFFLINE_TEXT } = F;
const named = (name, message = '') => Object.assign(new Error(message), { name });
const dom = (name) => new DOMException('The operation was aborted.', name);

const UNANSWERED = "We couldn't reach the server. " + OFFLINE_TEXT;
const FALLBACK = 'Something went wrong. Try again.';
const cases = [
    // No answer: every browser's words for it, a timeout, an abort.
    ['Chrome', new TypeError('Failed to fetch'), {}, UNANSWERED],
    ['Safari', new TypeError('Load failed'), {}, UNANSWERED],
    ['Firefox', new TypeError('NetworkError when attempting to fetch resource.'), {}, UNANSWERED],
    ['Node', new TypeError('fetch failed'), {}, UNANSWERED],
    ['a timeout', dom('TimeoutError'), {}, UNANSWERED],
    ['an abort', dom('AbortError'), {}, UNANSWERED],
    // A code chunk that would not load: webpack's error, and Next's message for it.
    ['a chunk', named('ChunkLoadError', 'Loading chunk 2414 failed.\n(error: https://agent.ochk.io/_next/static/chunks/2414.js)'), {}, UNANSWERED],
    ['a chunk, by its words', new Error('Loading chunk 731 failed.'), { fallback: 'That is not valid JSON.' }, UNANSWERED],
    ['a stylesheet chunk', new Error('Loading CSS chunk 88 failed.'), {}, UNANSWERED],
    ['a named source', new TypeError('Failed to fetch'), { source: 'mempool.space' }, 'mempool.space did not answer. ' + OFFLINE_TEXT],
    // An answer that was not JSON, a bug, a library, a code: the fallback.
    ['a proxy page', new SyntaxError('Unexpected token < in JSON at position 0'), {}, FALLBACK],
    ['a bug', new TypeError("Cannot read properties of undefined (reading 'id')"), { keepMessage: true }, FALLBACK],
    ['a library', new Error('seed lookup failed: Failed to fetch'), {}, FALLBACK],
    ['a code, kept', new Error('E_SNAPSHOT_UNRESOLVED'), { keepMessage: true }, FALLBACK],
    ['a snake code, kept', new Error('entitlement_missing'), { keepMessage: true }, FALLBACK],
    ['a string', 'HTTP 502', {}, FALLBACK],
    ['nothing', undefined, {}, FALLBACK],
    ['a fallback', new Error('500'), { fallback: 'The poll could not be read. Try again.' }, 'The poll could not be read. Try again.'],
    // The site's own sentence, kept when asked.
    ['a sentence, kept', new Error('That address has no stamps yet.'), { keepMessage: true }, 'That address has no stamps yet.'],
    ['a sentence, not kept', new Error('That address has no stamps yet.'), {}, FALLBACK],
    ['an abort, kept', named('AbortError', 'signal is aborted without reason'), { keepMessage: true }, UNANSWERED],
];
for (const [what, e, opts, want] of cases) {
    const got = say(e, opts);
    check(got === want, `${what}: ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    if (!opts.keepMessage) {
        check(!/fetch|TypeError|SyntaxError|\b[1-5]\d\d\b|[a-z]+_[a-z]+|\bE_[A-Z]/.test(got), `${what}: the words ${JSON.stringify(got)} carry a library's or a status code's`);
    }
}

// wordFor: a code read from the map's own keys, the fallback for anything else.
if (typeof F.wordFor !== 'function') {
    check(false, 'wordFor is not exported');
} else {
    const WORDS = { known: 'Known.' };
    check(F.wordFor(WORDS, 'known', 'Fallback.') === 'Known.', 'wordFor: a known code reads its word');
    for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'no_such_code']) {
        check(F.wordFor(WORDS, code, 'Fallback.') === 'Fallback.', `wordFor: ${code} reads ${String(F.wordFor(WORDS, code, 'Fallback.'))}, not the fallback`);
    }
    for (const code of [undefined, null, 7, {}]) {
        check(F.wordFor(WORDS, code, null) === null, `wordFor: a ${typeof code} code is not a key`);
    }
    // A map with no prototype, or with its own __proto__ key, still reads what it holds.
    const bare = Object.assign(Object.create(null), { known: 'Known.' });
    check(F.wordFor(bare, 'known', null) === 'Known.' && F.wordFor(bare, 'toString', null) === null, 'wordFor: a map with no prototype');
    const own = JSON.parse('{"__proto__": "Own."}');
    check(F.wordFor(own, '__proto__', null) === 'Own.', 'wordFor: a map\'s own __proto__ key');
}

if (failures) {
    console.error(`\n${failures} format failure(s)`);
    process.exit(1);
}
console.log(`✓ format: ${checks} checks; no answer names its source, every browser's words and codes stay off the screen, a site's own sentence only when kept, a code reads only a map's own keys`);
