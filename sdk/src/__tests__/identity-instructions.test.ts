/**
 * Proof instructions promise only checks the sdk makes. verifyTwitterIdentity
 * cannot read X, so the X instructions ask for no pasted URL and promise no
 * automatic check; and the text people post says orangecheck, lowercase.
 */

import { describe, expect, it } from 'vitest';

import { getNostrVerificationInstructions } from '../identity/nostr';
import { generateTweetText, getTwitterVerificationInstructions, verifyTwitterIdentity } from '../identity/twitter';

const ID = 'cd'.repeat(32);

describe('X (Twitter) and Nostr proof instructions', () => {
    it('X: no field to paste into, no automatic check, checked by hand', async () => {
        const text = getTwitterVerificationInstructions(ID, '@alice');
        expect(text).toContain(ID);
        expect(text).not.toMatch(/paste the URL below/i);
        expect(text).not.toMatch(/will check that the tweet exists/i);
        expect(text).toMatch(/checked by hand/);
        // What the wording rests on: a tweet URL never verifies here.
        const r = await verifyTwitterIdentity(ID, 'alice', 'https://twitter.com/alice/status/1234567890');
        expect(r.verified).toBe(false);
    });

    it('the text people post says orangecheck, lowercase, beside the ID', () => {
        for (const text of [
            getTwitterVerificationInstructions(ID, 'alice'),
            generateTweetText(ID),
            getNostrVerificationInstructions(ID),
        ]) {
            expect(text).toContain(`Verifying my orangecheck attestation: ${ID}`);
            expect(text).not.toContain('OrangeCheck');
        }
    });
});
