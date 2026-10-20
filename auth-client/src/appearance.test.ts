import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    SIGNIN_CASE,
    SIGNIN_FONT,
    signinRadius,
    signinRoleSize,
    signinSize,
    signinTracking,
} from './appearance';

describe('sign-in appearance', () => {
    it('falls back to the family look when a site sets nothing', () => {
        expect(SIGNIN_FONT).toBe('var(--oc-signin-font, ui-monospace, SFMono-Regular, monospace)');
        expect(SIGNIN_CASE).toBe('var(--oc-signin-case, uppercase)');
        expect(signinTracking('0.12em')).toBe('var(--oc-signin-tracking, 0.12em)');
        expect(signinSize(11)).toBe('calc(11px * var(--oc-signin-scale, 1))');
        expect(signinRadius(6)).toBe('var(--oc-signin-radius, 6px)');
        // A role size falls back to the element's own family size, so a classic site is unchanged.
        expect(signinRoleSize('hint', '10.5px')).toBe('var(--oc-signin-hint-size, 10.5px)');
        expect(signinRoleSize('button', signinSize(11))).toBe(
            'var(--oc-signin-button-size, calc(11px * var(--oc-signin-scale, 1)))'
        );
    });

    // The ceremony's text takes a site's sizes: only the 16px of a field, which
    // keeps iOS from zooming, is fixed.
    it('signin.tsx has no fixed text size a site cannot reach', () => {
        const src = readFileSync(join(__dirname, 'signin.tsx'), 'utf8');
        expect(src.match(/fontSize: (?!16\b)\d[\d.]*/g) ?? []).toEqual([]);
    });

    // A literal here is a style ochk.app cannot reach; it renders in the
    // family look inside the app's design.
    it.each(['signin.tsx', 'linked-identities.tsx'])('%s has no unthemeable type literal', (file) => {
        const src = readFileSync(join(__dirname, file), 'utf8');
        expect(src).not.toMatch(/fontFamily: 'ui-monospace/);
        expect(src).not.toMatch(/textTransform: 'uppercase'/);
        expect(src).not.toMatch(/letterSpacing: '0\.1\d?em'/);
    });
});
