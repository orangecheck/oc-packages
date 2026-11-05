/**
 * A site's theme-color metas come from app-design's THEME_COLOR, the page's ground
 * generated from tokens.css with the CSS variables, not a hex the site types:
 * every _document typed 1.x's #fafafa and #0a0a0a.
 */
import { THEME_COLOR } from '@orangecheck/app-design/tokens';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ThemeColorMeta } from './index';

describe('ThemeColorMeta', () => {
    it("draws the page's ground in light and dark, from app-design's tokens", () => {
        const html = renderToStaticMarkup(<ThemeColorMeta />);
        expect(html).toBe(
            `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLOR.light}"/>` +
                `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLOR.dark}"/>`
        );
        // 2.0's paper and night, not 1.x's.
        expect([THEME_COLOR.light, THEME_COLOR.dark]).toEqual(['#eeeae6', '#0e0c0b']);
    });
});
