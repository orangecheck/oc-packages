/**
 * @vitest-environment jsdom
 *
 * The skip note after sign-in tells a person where to link the other way in
 * later. ochk.app replaces me.ochk.io's pages, so it must send them to
 * ochk.app's account page, at the section that holds the ways to sign in.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [],
    getSigner: () => async () => 'unused',
}));

import { LinkPromptStep } from '../linked-identities';

afterEach(cleanup);

describe('LinkPromptStep · where to link later', () => {
    it.each(['btc', 'email'] as const)('links %s to ochk.app/me/account#ways', (method) => {
        const { container } = render(
            <LinkPromptStep
                method={method}
                didOc="did:oc:test"
                authOrigin="https://ochk.io"
                onResolved={() => {}}
            />
        );
        const link = screen.getByRole('link', { name: 'ochk.app/me/account' });
        expect(link.getAttribute('href')).toBe('https://ochk.app/me/account#ways');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(container.textContent).not.toMatch(/me\.ochk\.io/);
    });
});
