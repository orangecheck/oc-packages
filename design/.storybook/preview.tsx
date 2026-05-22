import type { Decorator, Preview } from '@storybook/react';
import { useEffect } from 'react';

import './storybook.css';
import { OC_THEMES } from '../src/tokens/themes';

/**
 * Two-axis toolbar: `skin` (data-oc-theme) × `mode` (.dark). Applied to
 * <html> so every story renders exactly as it would in a real family site,
 * in any skin × mode combination.
 */
const withTheme: Decorator = (Story, context) => {
    // Stories that render their own skin/mode panels (the Themes matrix) opt out
    // so the toolbar doesn't impose a global .dark on their light panels.
    const disabled = Boolean(context.parameters?.disableGlobalTheme);
    const mode = context.globals.mode as string;
    const skin = context.globals.skin as string;

    useEffect(() => {
        const root = document.documentElement;
        if (disabled) {
            root.classList.remove('dark');
            root.setAttribute('data-oc-theme', 'orangecheck');
            return;
        }
        root.setAttribute('data-oc-theme', skin);
        root.classList.toggle('dark', mode === 'dark');
    }, [mode, skin, disabled]);

    return (
        <div className={disabled ? 'min-h-screen p-8' : 'bg-background text-foreground min-h-screen p-8'}>
            <Story />
        </div>
    );
};

const preview: Preview = {
    parameters: {
        layout: 'fullscreen',
        controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
        options: {
            storySort: {
                order: ['Overview', 'Tokens', 'Primitives', 'Composites', 'Patterns'],
            },
        },
    },
    initialGlobals: { mode: 'light', skin: 'orangecheck' },
    globalTypes: {
        skin: {
            description: 'Theme skin (data-oc-theme)',
            toolbar: {
                title: 'Skin',
                icon: 'paintbrush',
                dynamicTitle: true,
                items: OC_THEMES.map((t) => ({ value: t.id, title: t.label })),
            },
        },
        mode: {
            description: 'Light / dark mode',
            toolbar: {
                title: 'Mode',
                icon: 'circlehollow',
                dynamicTitle: true,
                items: [
                    { value: 'light', title: 'light' },
                    { value: 'dark', title: 'dark' },
                ],
            },
        },
    },
    decorators: [withTheme],
};

export default preview;
