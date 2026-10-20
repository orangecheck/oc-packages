import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

/** The site's own name and the visitor's mode, light or dark, for the frame around the stories. */
const dark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

addons.setConfig({
    // The stories take the window; the controls panel opens from the toolbar when wanted.
    showPanel: false,
    theme: create({
        base: dark ? 'dark' : 'light',
        brandTitle: 'orangecheck design system',
        brandUrl: 'https://design.ochk.io',
        brandTarget: '_self',
    }),
});
