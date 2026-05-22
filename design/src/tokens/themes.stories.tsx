import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { OcThemeProvider } from './provider';
import { OcThemePicker } from './theme-picker';
import { OC_THEMES } from './themes';

const meta = {
    title: 'Themes/Matrix',
    parameters: { layout: 'fullscreen', disableGlobalTheme: true },
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** A self-contained sample of the system, rendered under one skin × one mode. */
function Panel({ skin, mode }: { skin: string; mode: 'light' | 'dark' }) {
    return (
        <div
            data-oc-theme={skin}
            className={`${mode === 'dark' ? 'dark ' : ''}bg-background text-foreground rounded-md border p-5`}
        >
            <div className="label-mono text-primary mb-4">
                {skin} · {mode}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm">primary</Button>
                <Button size="sm" variant="secondary">
                    secondary
                </Button>
                <Button size="sm" variant="outline">
                    outline
                </Button>
                <Button size="sm" variant="ghost">
                    ghost
                </Button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
                <Badge>default</Badge>
                <Badge variant="success">success</Badge>
                <Badge variant="warning">warning</Badge>
                <Badge variant="destructive">error</Badge>
                <Badge variant="info">info</Badge>
            </div>
            <Input className="mb-3" placeholder="bc1q…" />
            <div className="bg-card text-card-foreground rounded-md border p-3 text-sm">
                card surface · <span className="text-muted-foreground">muted caption</span> ·{' '}
                <a className="text-primary underline">link</a>
            </div>
        </div>
    );
}

/**
 * Every registered skin in BOTH light and dark, side by side. This is the proof
 * that the multi-theme rail re-colors the entire system: every panel renders the
 * same components reading the same semantic tokens — only `data-oc-theme` and
 * `.dark` differ.
 */
export const AllSkins: Story = {
    name: 'All skins × light/dark',
    render: () => (
        <div className="space-y-8">
            {OC_THEMES.map((t) => (
                <section key={t.id}>
                    <h2 className="font-display mb-1 text-lg">{t.label}</h2>
                    <p className="text-muted-foreground mb-4 text-sm">{t.description}</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel skin={t.id} mode="light" />
                        <Panel skin={t.id} mode="dark" />
                    </div>
                </section>
            ))}
        </div>
    ),
};

/** The live skin picker (writes the oc_skin cookie, sets data-oc-theme). */
export const Picker: Story = {
    name: 'Live skin picker',
    parameters: { disableGlobalTheme: false },
    render: () => (
        <OcThemeProvider>
            <div className="space-y-4">
                <p className="text-muted-foreground max-w-prose text-sm">
                    The picker sits beside the light/dark toggle in the header. It writes the{' '}
                    <code className="text-primary font-mono">oc_skin</code> cookie at{' '}
                    <code className="text-primary font-mono">Domain=.ochk.io</code> so the choice
                    follows the user across every family site. Click it, then watch the components
                    below recolor:
                </p>
                <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm">choose theme →</span>
                    <OcThemePicker />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button>primary</Button>
                    <Button variant="outline">outline</Button>
                    <Badge variant="success">success</Badge>
                    <Badge variant="info">info</Badge>
                </div>
            </div>
        </OcThemeProvider>
    ),
};
