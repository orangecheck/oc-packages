/**
 * Proof instructions promise only checks the sdk makes. verifyTwitterIdentity
 * cannot read X, so the X instructions ask for no pasted URL and promise no
 * automatic check; and the text people post says orangecheck, lowercase.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateWellKnownContent, getDnsVerificationInstructions } from '../identity/dns';
import { generateGistTemplate, getGitHubVerificationInstructions } from '../identity/github';
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
        for (const text of [
            generateGistTemplate(ID, 'alice'),
            getGitHubVerificationInstructions(ID),
            getDnsVerificationInstructions(ID, 'example.com'),
        ]) {
            expect(text).toContain(ID);
            expect(text).not.toContain('OrangeCheck');
        }
    });
});

describe('the well-known file', () => {
    afterEach(() => vi.useRealTimers());

    it('is pinned whole: orangecheck, lowercase, in every line', () => {
        vi.useFakeTimers({ now: new Date('2026-11-04T05:00:00.000Z') });
        expect(generateWellKnownContent(ID, 'https://example.com/')).toBe(`orangecheck attestation verification
=====================================

Domain: example.com
Attestation ID: ${ID}
Timestamp: 2026-11-04T05:00:00.000Z

This file verifies that the owner of example.com controls the Bitcoin
address associated with attestation ${ID}.

Learn more: https://ochk.io

---

Verification method: .well-known/orangecheck.txt
Protocol: orangecheck protocol (OCP)
`);
    });
});
