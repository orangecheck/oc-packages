import { PaintBrushIcon } from '@storybook/icons';
import { createElement } from 'react';
import { Select } from 'storybook/internal/components';
import { addons, types, useGlobals } from 'storybook/manager-api';
import { create } from 'storybook/theming';

import { MARK_FACES, MARK_POINTS } from '../../app-design/src/brand/mark';
import { OC_THEMES } from '../src/tokens/themes';

/** The classic skin's picker, on the Classic (frozen) stories only: the family's system has no skins. */
const SKINS = OC_THEMES.map((t) => ({ value: t.id, title: `Classic · ${t.label}` }));
function ClassicSkin() {
    const [globals, updateGlobals] = useGlobals();
    return createElement(Select, {
        ariaLabel: 'Classic skin',
        tooltip: 'Classic skin',
        icon: createElement(PaintBrushIcon),
        options: SKINS,
        defaultOptions: [globals.skin],
        onSelect: (skin) => updateGlobals({ skin }),
    });
}
addons.register('oc-classic-skin', () => {
    addons.add('oc-classic-skin/tool', {
        type: types.TOOL,
        title: 'Classic skin',
        match: ({ storyId }) => Boolean(storyId?.startsWith('classic-frozen-')),
        render: ClassicSkin,
    });
});

/** The site's own name and the visitor's mode, light or dark, for the frame around the stories. */
const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** app-design 2.0's tokens (styles/tokens.css), for the frame Storybook draws around the stories: square, paper or night. */
const ink = dark
    ? { ground: '#0e0c0b', raised: '#161412', field: '#1c1916', sunken: '#26221f', text: '#eeeae6', soft: '#a39d97', hairline: '#242221', rule: '#363432', edge: '#6f6964', accent: '#fb923c', ring: '#f97316' }
    : { ground: '#eeeae6', raised: '#f5f2ef', field: '#ffffff', sunken: '#e4e0dc', text: '#161412', soft: '#5e5852', hairline: '#d4d0cd', rule: '#c3bfbc', edge: '#8a837d', accent: '#9a3412', ring: '#c2410c' };

/**
 * The chrome lockup, app-design's ProductLockup at the app shell's size: the flat check, the
 * wordmark in Inter 400, a strong hairline, the site's word in 500. Storybook sets a brandTitle
 * as the link's HTML, so the drawing is hidden from screen readers and the link reads the name.
 */
const size = 24;
const mark = `<svg viewBox="0 0 16 8" width="${size}" height="${size / 2}" style="flex-shrink:0"><polygon points="${MARK_POINTS.left}" fill="${MARK_FACES.left}"/><polygon points="${MARK_POINTS.right}" fill="${MARK_FACES.right}"/><polygon points="${MARK_POINTS.top}" fill="${MARK_FACES.top}"/></svg>`;
const lockup =
    `<span aria-hidden="true" style="display:inline-flex;align-items:center;color:${ink.text};font-size:${(size * 0.7).toFixed(1)}px;line-height:1">` +
    `<span style="display:inline-flex;align-items:center;gap:${size / 3}px;font-weight:400;letter-spacing:-0.024em">${mark}orangecheck</span>` +
    `<span style="width:1px;height:20px;margin:0 12px;background:${ink.rule}"></span>` +
    `<span style="font-weight:500;letter-spacing:-0.01em">design</span></span>` +
    `<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">orangecheck design system</span>`;

addons.setConfig({
    // The stories take the window; the controls panel opens from the toolbar when wanted.
    showPanel: false,
    theme: create({
        base: dark ? 'dark' : 'light',
        colorPrimary: ink.ring,
        // The selected story: white words on deep orange, 5.18:1 by day (Storybook darkens it at night: 11:1).
        colorSecondary: '#c2410c',
        appBg: ink.ground,
        appContentBg: ink.raised,
        appPreviewBg: ink.ground,
        appBorderColor: ink.hairline,
        appBorderRadius: 0,
        fontBase: "'OCA Inter', 'OCA Inter Fallback', ui-sans-serif, system-ui, sans-serif",
        fontCode: "'OCA JetBrains Mono', ui-monospace, monospace",
        textColor: ink.text,
        textInverseColor: ink.ground,
        textMutedColor: ink.soft,
        barBg: ink.raised,
        barTextColor: ink.soft,
        barSelectedColor: ink.accent,
        barHoverColor: ink.accent,
        inputBg: ink.field,
        inputBorder: ink.edge,
        inputTextColor: ink.text,
        inputBorderRadius: 0,
        buttonBg: ink.raised,
        buttonBorder: ink.edge,
        booleanBg: ink.sunken,
        booleanSelectedBg: ink.raised,
        brandTitle: lockup,
        brandUrl: 'https://design.ochk.io',
        brandTarget: '_self',
    }),
});
