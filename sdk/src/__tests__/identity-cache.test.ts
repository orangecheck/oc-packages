/**
 * The is*IdentityVerified helpers answer from data the caller already fetched.
 * Each must still bind the answer to the identity it was asked about.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';

import type { NostrEvent } from '../types';

import {
    generateWellKnownContent,
    isDnsIdentityVerified,
    isGitHubIdentityVerified,
    isNostrIdentityVerified,
} from '../index';

const ID = 'a3f5b8c2d1e4f6a7b9c0d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3';

function gist(login: string | undefined, description: string) {
    return {
        id: 'g1',
        html_url: 'https://gist.github.com/g1',
        description,
        public: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        files: {},
        ...(login ? { owner: { login } } : {}),
    };
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function signedNote(content: string, sk = schnorr.utils.randomSecretKey()): NostrEvent {
    const pubkey = hex(schnorr.getPublicKey(sk));
    const created_at = 1_700_000_000;
    const id = hex(
        sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, created_at, 1, [], content])))
    );
    const sig = hex(schnorr.sign(Uint8Array.from(Buffer.from(id, 'hex')), sk));
    return { id, pubkey, created_at, kind: 1, tags: [], content, sig } as NostrEvent;
}

describe('isGitHubIdentityVerified', () => {
    it('counts only gists owned by the username asked about', () => {
        expect(isGitHubIdentityVerified(ID, 'alice', [gist('mallory', ID)])).toBe(false);
        expect(isGitHubIdentityVerified(ID, 'alice', [gist(undefined, ID)])).toBe(false);
        expect(isGitHubIdentityVerified(ID, 'alice', [gist('Alice', ID)])).toBe(true);
    });
});

describe('isDnsIdentityVerified', () => {
    it('refuses a well-known file written for another domain', () => {
        const other = generateWellKnownContent(ID, 'evil.example');
        expect(isDnsIdentityVerified(ID, 'alice.example', other)).toBe(false);
        const own = generateWellKnownContent(ID, 'alice.example');
        expect(isDnsIdentityVerified(ID, 'alice.example', own)).toBe(true);
    });

    it('still accepts a TXT value that is just the id', () => {
        expect(isDnsIdentityVerified(ID, 'alice.example', ID)).toBe(true);
    });
});

describe('isNostrIdentityVerified', () => {
    it('refuses a cached note whose signature does not verify', () => {
        const note = signedNote(`Verifying my OrangeCheck attestation: ${ID}`);
        const forged = { ...note, sig: '0'.repeat(128) };
        expect(isNostrIdentityVerified(ID, note.pubkey, [forged])).toBe(false);
        const edited = { ...note, content: `${note.content} edited` };
        expect(isNostrIdentityVerified(ID, note.pubkey, [edited])).toBe(false);
        expect(isNostrIdentityVerified(ID, note.pubkey, [note])).toBe(true);
    });
});
