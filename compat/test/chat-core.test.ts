import { verifySessionVouch } from '@orangecheck/chat-core';
import { describe, expect, it } from 'vitest';

import { keyed, plain } from '../src/account';
import { jwks, signStatement } from '../src/mint';

/**
 * Plan §2, chat-core 0.2.8: verifySessionVouch accepts the vouch ochk.io mints for a session
 * device of the account. It reads the statement byte for byte, so nothing may be added to it.
 */

type Account = typeof plain;

const vouchOf = (a: Account) => signStatement(a.chat_vouch.statement, a.chat_vouch.header.typ as string);
const subjectOf = (a: Account) => ({ didOc: a.token_claims.did_oc as string, ...a.chat_vouch.request });

describe('chat-core 0.2.8', () => {
    it("verifySessionVouch accepts the vouch ochk.io mints for the account's device", async () => {
        expect(plain.chat_vouch.header.typ).toBe('oc-chat-device-vouch');
        expect(verifySessionVouch(await vouchOf(plain), subjectOf(plain), jwks.keys)).toBe(true);
        expect(verifySessionVouch(await vouchOf(keyed), subjectOf(keyed), jwks.keys)).toBe(true);
    });

    it('still refuses the same vouch for another device', async () => {
        const other = { ...subjectOf(keyed), device_id: '0'.repeat(32) };
        expect(verifySessionVouch(await vouchOf(keyed), subjectOf(keyed), jwks.keys)).toBe(true);
        expect(verifySessionVouch(await vouchOf(keyed), other, jwks.keys)).toBe(false);
    });
});
