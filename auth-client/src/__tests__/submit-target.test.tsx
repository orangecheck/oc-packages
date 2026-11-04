/**
 * @vitest-environment jsdom
 *
 * Every submit button the sign-in draws (send the code, verify it, the wallet's steps) is a
 * 44px target, as its tabs and the opt-in row are: the padding round one line of text drew
 * "Send one-time code" 42px tall. The style is read from the server's markup, where React
 * writes it as given.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [],
    getSigner: () => async () => 'unused',
}));

import { OcSignIn } from '../signin';

describe('the sign-in submit buttons', () => {
    it('are 44px tall at least', () => {
        const html = renderToStaticMarkup(<OcSignIn audience="https://ochk.io" initialPath="email" />);
        const submits = html.match(/<button type="submit"[^>]*>/g) ?? [];
        expect(submits.length).toBeGreaterThan(0);
        for (const b of submits) expect(b).toMatch(/min-height:44px/);
    });
});
