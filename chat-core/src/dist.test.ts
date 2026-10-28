// The built package, as an installer gets it: ./io throws the same
// UnansweredReadError class the main entry exports, in ESM and in CJS, so a
// caller's instanceof tells "not read" from "failed". CI builds before it tests.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIST = join(__dirname, '..', 'dist');
if (!existsSync(DIST) && process.env.CI) throw new Error('dist not built: run yarn build before yarn test');
const describeBuilt = existsSync(DIST) ? describe : describe.skip;

const PROOF = { outpoint: `${'ab'.repeat(32)}:0`, value_sats: 1, anchor_block_height: 1, anchor_block_hash: '00' };
const down = (async () => {
    throw new TypeError('fetch failed');
}) as unknown as typeof fetch;

describeBuilt('dist', () => {
    it('ESM: ./io throws the main entry’s UnansweredReadError', async () => {
        const main = await import(join(DIST, 'index.mjs'));
        const io = await import(join(DIST, 'io.mjs'));
        const err = await io.esploraWriteProofCheck({ fetch: down, unanswered: 'throw' })(PROOF, 'bc1q').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(main.UnansweredReadError);
    });

    it('CJS: ./io throws the main entry’s UnansweredReadError', async () => {
        const require = createRequire(__filename);
        const main = require(join(DIST, 'index.js'));
        const io = require(join(DIST, 'io.js'));
        const err = await io.esploraWriteProofCheck({ fetch: down, unanswered: 'throw' })(PROOF, 'bc1q').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(main.UnansweredReadError);
    });
});
