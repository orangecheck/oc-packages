import type { Meta, StoryObj } from '@storybook/react';

import { HalftoneSphere, Lockup } from './brand';
import { Accent, Display, Eyebrow, Lead, Prose } from './components';
import { Badge } from './primitives';
import portrait from './assets/portrait-halftone-600.webp';

const meta: Meta = { title: 'Introduction', parameters: { fullBleed: true } };
export default meta;

export const Overview: StoryObj = {
    render: () => (
        <div className="oca-container py-16">
            <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
                <div className="flex flex-col gap-6">
                    <Lockup size={32} />
                    <Display level={1}>
                        One design system for <Accent>orangecheck</Accent>.
                    </Display>
                    <Lead>
                        ochk.app, ochk.io and its docs, the six protocol tools and the apps draw from it: the tokens, type,
                        mark and photography, the family's chrome and the parts each site needs. It applies only under
                        <code className="mx-1">data-oc-app="ochk"</code>, so a site moves over whole.
                    </Lead>
                    <div className="flex flex-wrap gap-2">
                        <Badge>@orangecheck/app-design</Badge>
                        <Badge tone="muted">AA contrast, checked in CI</Badge>
                        <Badge tone="muted">light · dark</Badge>
                    </div>
                </div>
                <HalftoneSphere src={portrait} alt="" stadium className="mx-auto max-w-sm" />
            </div>
            <Prose className="mt-20">
                <Eyebrow>Where the deck was fixed, not copied</Eyebrow>
                <h2>Contrast</h2>
                <p>
                    The deck's orange, <code>#F66D36</code>, is 2.81:1 as text on the canvas. That fails AA for body
                    text and for display text. Fills keep it. Headlines use <code>#F55819</code> (3.2:1, display sizes
                    only) and small accent text uses <code>#C73F09</code> (4.9:1). On the orange band, text is ink, as
                    the design draws it.
                </p>
                <h2>What stays the deck's</h2>
                <p>
                    Inter at regular weight for display, with optical sizing doing the tightening. Pills for actions,
                    white cards with one hairline, no shadows outside overlays. The isometric check is measured from
                    slide 9 and drawn on a 16×8 grid. The portrait is re-screened from the deck by{' '}
                    <code>scripts/halftone.py</code>, which turns any photo into a dot layer.
                </p>
                <h2>Using it</h2>
                <p>
                    Import <code>@orangecheck/app-design/styles.css</code> after Tailwind, put{' '}
                    <code>data-oc-app="ochk"</code> on <code>&lt;html&gt;</code>, list the package in{' '}
                    <code>transpilePackages</code>, and use plain next-themes for light and dark. Never mount the
                    classic system's skin provider on the same page.
                </p>
                <h2>The classic system</h2>
                <p>
                    <code>@orangecheck/design</code>, with its skins, is frozen: fixes only, no new components, no new
                    site on it. Its stories stay under Classic (frozen) for the owner tools still on it, until they
                    move.
                </p>
            </Prose>
        </div>
    ),
};
