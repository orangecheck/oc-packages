/**
 * @vitest-environment jsdom
 *
 * The opt-in under the sign-in ("After signing in, also link…") is the design
 * system's checkbox, not the browser's: a 20px square drawn from the page's
 * tokens, with no platform accent colour, a mark drawn when it is checked, and
 * the whole 44px row as its target. It still behaves as a checkbox.
 *
 * The look is read from the server's markup, where React writes the style as
 * given: jsdom drops CSS properties it does not know (appearance, accent-color).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [],
    getSigner: () => async () => 'unused',
}));

import { OcSignIn } from '../signin';

afterEach(cleanup);

const NAME = /After signing in, also link/;

function optIn(html: string) {
    const label = html.match(/<label data-oc-signin-linkalso=""[^>]*>[\s\S]*?<\/label>/)?.[0] ?? '';
    return { label, input: label.match(/<input[^>]*>/)?.[0] ?? '' };
}

describe('the sign-in opt-in looks like the design checkbox', () => {
    it('is a 20px square from the tokens, with no native accent', () => {
        const { label, input } = optIn(renderToStaticMarkup(<OcSignIn audience="https://ochk.io" />));
        expect(input).toMatch(/type="checkbox"/);
        expect(input).not.toMatch(/accent-color/);
        expect(input).toMatch(/appearance:none/);
        expect(input).toMatch(/width:20px/);
        expect(input).toMatch(/height:20px/);
        expect(input).toMatch(/border-radius:0/);
        expect(input).toMatch(/border:1px solid var\(--input/);
        // The row is the target: 44px tall to a thumb.
        expect(label).toMatch(/min-height:44px/);
    });

    it('draws a checked box in Highlight under forced colors, as a native checkbox does', () => {
        // Forced colors repaint the fill to Canvas but leave the mark its own white: a checked box
        // looked unchecked. Only a browser shows that; this pins the rule that answers it.
        const { label } = optIn(renderToStaticMarkup(<OcSignIn audience="https://ochk.io" />));
        const sheet = label.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
        expect(sheet).toMatch(/^@media \(forced-colors: active\)\{/);
        expect(sheet).toContain('input[type=checkbox]:checked{border-color:Highlight!important;background:Highlight!important}');
        expect(sheet).toContain('svg[data-oc-check]{color:HighlightText!important}');
        expect(sheet).toContain('[data-oc-control] input{border-color:CanvasText!important;background:Canvas!important}');
    });
});

describe('the sign-in opt-in still behaves as a checkbox', () => {
    it('starts unchecked; its row checks it and draws the mark; again clears it', () => {
        const { container } = render(<OcSignIn audience="https://ochk.io" />);
        const box = screen.getByRole('checkbox', { name: NAME }) as HTMLInputElement;
        const row = container.querySelector('label[data-oc-signin-linkalso]') as HTMLLabelElement;
        const mark = () => row.querySelector('svg[data-oc-check]');
        expect(box.checked).toBe(false);
        expect(mark()).toBeNull();
        fireEvent.click(row.querySelector('span:last-child') as HTMLElement);
        expect(box.checked).toBe(true);
        expect(mark()).not.toBeNull();
        fireEvent.click(box);
        expect(box.checked).toBe(false);
        expect(mark()).toBeNull();
    });

    it('is left out with linkPrompt={false}', () => {
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        expect(screen.queryByRole('checkbox', { name: NAME })).toBeNull();
    });
});
