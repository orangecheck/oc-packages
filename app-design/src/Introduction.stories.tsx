import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';

import changelog from '../CHANGELOG.md?raw';
import portrait from '../art/portrait-halftone-600.webp';
import { BentoGrid, BentoTile, DitherMark } from './blocks';
import { Lockup } from './brand';
import { SiteFooter, SiteHeader } from './chrome';
import { DocColumns, Frame, MonoLabel, PageFrame, PageHero, Prose, Section, SectionBar, SectionHeading, StatRow, StepGrid, Toc, VerifyReport } from './components';
import type { TocItem } from './components';
import { DitherImage } from './motion';
import { Button } from './primitives';

/*
 * design.ochk.io's front page, drawn from the package's own parts: the header, the frame and its
 * bars, the two logos, a photograph, steps, tiles, the verifier, the long page and the footer. Its
 * releases come from CHANGELOG.md, so it cannot fall behind the package.
 */
const meta: Meta = { title: 'Introduction', parameters: { fullBleed: true } };
export default meta;

interface Release {
    version: string;
    date?: string;
    /** The opening sentence of each of the release's stanzas. */
    lines: string[];
}

/** CHANGELOG.md's releases, newest first: a stanza opens with a sentence; bullets, headings and indented lines are its body. */
function readReleases(md: string): Release[] {
    return md
        .split(/^## /m)
        .slice(1)
        .flatMap((part) => {
            const [head = '', ...rest] = part.split('\n');
            const m = /^\[([^\]]+)\](?:\s+—\s+(\d{4}-\d{2}-\d{2}))?/.exec(head);
            if (!m?.[1]) return [];
            const lines = rest
                .join('\n')
                .trim()
                .split(/\n[ \t]*\n/)
                .filter((p) => /^[^\s\-*#|>`]/.test(p))
                .map((p) => {
                    const flat = p.replace(/\s*\n\s*/g, ' ');
                    return flat.match(/^.*?[.:](?=\s|$)/)?.[0] ?? flat;
                });
            return lines.length ? [{ version: m[1], date: m[2], lines }] : [];
        });
}

const RELEASES = readReleases(changelog).slice(0, 6);
const LATEST = RELEASES.find((r) => r.version !== 'Unreleased')?.version;
const slug = (version: string) => `v${version.toLowerCase().replace(/\W+/g, '-')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A changelog line, its `code` spans as code. */
function Line({ text }: { text: string }) {
    return <>{text.split('`').map((s, i) => (i % 2 ? <code key={i}>{s}</code> : s))}</>;
}

const SOURCE = 'https://github.com/orangecheck/oc-packages/tree/main/app-design';
const NAV = [
    { href: '#frame', label: 'Parts' },
    { href: '#use', label: 'Using it' },
    { href: '#notes', label: 'Releases' },
];
const COUNT = 7;
const of = (n: number) => `${String(n).padStart(2, '0')} / ${String(COUNT).padStart(2, '0')}`;
const bar = (n: number, start: ReactNode) => ({ start, end: of(n), as: 'h2' as const });

function Part({ n, id, label, title, lead, children }: { n: number; id: string; label: string; title: ReactNode; lead: ReactNode; children: ReactNode }) {
    return (
        <Section framed id={id} bar={bar(n, label)}>
            <SectionHeading layout="split" level={3} as="h3" title={title} lead={lead} />
            <div className="mt-12 md:mt-16">{children}</div>
        </Section>
    );
}

const TOC: TocItem[] = [
    { id: 'releases', num: '01', label: 'Releases' },
    ...RELEASES.map((r) => ({ id: slug(r.version), label: r.version, level: 3 as const })),
    { id: 'contrast', num: '02', label: 'Contrast' },
    { id: 'classic', num: '03', label: 'The classic system' },
];

export const Overview: StoryObj = {
    render: () => (
        <>
            {/* Static, as Chrome's stories draw it: the census reads every story on one page, where another story's app
                bar takes the site bar's scroll room from lg and a sticky one would cover the hero's buttons. */}
            <SiteHeader className="static" product="design" nav={NAV} cta={{ label: 'Source', href: SOURCE }} />
            <PageFrame as="div">
                <PageHero
                    layout="s10"
                    size="xl"
                    eyebrow={LATEST ? `@orangecheck/app-design ${LATEST}` : '@orangecheck/app-design'}
                    title={
                        <>
                            <span className="block">One design system</span> <span className="block text-oca-subtle">for orangecheck.</span>
                        </>
                    }
                    lead="ochk.app, ochk.io and its docs, the six protocol tools and the apps are drawn from it. Everything on this page is one of its parts."
                    actions={
                        <>
                            <Button asChild size="lg" plus>
                                <a href="#notes">What is new</a>
                            </Button>
                            <Button asChild size="lg" variant="secondary" plus>
                                <a href="#use">Use it</a>
                            </Button>
                        </>
                    }
                    art={<DitherMark size="sm" />}
                />

                <Part
                    n={1}
                    id="frame"
                    label="The frame"
                    title="Every page is drawn in one frame."
                    lead="A column ruled at each side, its sections and bands between the rules, each opening on a bar like the one above."
                >
                    <StatRow
                        items={[
                            { value: '82.5rem', label: 'The column', note: 'At most; ruled from 900px' },
                            { value: '3rem', label: 'The gutter', note: '1rem on a phone' },
                            { value: '0', label: 'Corner radius', note: 'Square everywhere' },
                            { value: '4.5:1', label: 'Text contrast', note: '3:1 at display sizes' },
                        ]}
                    />
                </Part>

                <Part
                    n={2}
                    id="mark"
                    label="The mark"
                    title="Two logos, one switch."
                    lead={
                        <p>
                            Classic is the default. <code className="whitespace-nowrap">?logo=pixel</code> on any ochk.io page shows this browser the pixel logo on every ochk.io site, and{' '}
                            <code className="whitespace-nowrap">?logo=classic</code> brings classic back.
                        </p>
                    }
                >
                    <div className="grid grid-cols-1 border-l border-t border-border sm:grid-cols-2">
                        {(['classic', 'pixel'] as const).map((logo) => (
                            <figure key={logo} className="m-0 flex min-h-56 flex-col justify-between gap-10 border-b border-r border-border p-6 md:p-8">
                                <MonoLabel as="span">{logo === 'classic' ? 'Classic, the default' : 'Pixel, by ?logo=pixel'}</MonoLabel>
                                <Lockup logo={logo} variant="flat" size={48} />
                            </figure>
                        ))}
                    </div>
                </Part>

                <Part
                    n={3}
                    id="photos"
                    label="Photographs"
                    title="Photographs, in two tones."
                    lead="A picture is drawn at whole CSS pixels and never stretched, so every cell stays square: a narrow screen sees its middle at the grain a wide one sees all of it. With a mouse, pass over this one: the screen comes alive where you go, then settles."
                >
                    {/* Under the lead, on the orange band, one still pixel to one CSS pixel: a narrower panel crops it. */}
                    <div className="grid grid-cols-1 gap-x-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="oca-band-brand flex justify-center overflow-hidden lg:col-start-2">
                            <DitherImage src={portrait} width={600} height={600} alt="" dark="#161412" className="w-[600px] max-w-none shrink-0" />
                        </div>
                    </div>
                </Part>

                <Part n={4} id="use" label="Using it" title="Three lines to start." lead="In a Next app on Tailwind 4. A page without the attribute is left as it was.">
                    <StepGrid
                        look="line"
                        items={[
                            {
                                title: 'Import the styles',
                                body: (
                                    <>
                                        <code>@import '@orangecheck/app-design/styles.css';</code> after Tailwind, with an <code>@source</code> for the package's <code>dist</code>.
                                    </>
                                ),
                            },
                            {
                                title: 'Scope the page',
                                body: (
                                    <>
                                        <code>data-oc-app="ochk"</code> on <code>&lt;html&gt;</code>. Light and dark come from <code>ThemeProvider</code>, in <code>/chrome</code>.
                                    </>
                                ),
                            },
                            {
                                title: 'Compile it',
                                body: (
                                    <>
                                        <code>transpilePackages: ['@orangecheck/app-design']</code> in next.config, so its links share the app's router.
                                    </>
                                ),
                            },
                        ]}
                    />
                </Part>

                <Part
                    n={5}
                    id="grounds"
                    label="Grounds"
                    title="Four grounds, and the product on any of them."
                    lead="A page alternates paper, the ink band, the burnt band and the orange band. A part on a band takes the band's colours; a window drawn on one keeps the page's."
                >
                    <BentoGrid>
                        <BentoTile span={2} rows={2} tone="paper" label="Paper" title="The page's own ground." art={<DitherMark size="md" ground="theme" />} />
                        <BentoTile tone="ink" label="Ink band" title="Paper words, an orange accent." />
                        <BentoTile tone="brand" label="Orange band" title="Words in ink: white is 2.8:1 here." />
                        <BentoTile tone="burnt" halftone label="Burnt band" title="The dark brown stage." />
                        <BentoTile tone="white" label="Depictions" title="A window or a phone, in the page's colours." />
                    </BentoGrid>
                </Part>

                <Part
                    n={6}
                    id="verifier"
                    label="The verifier"
                    title="A verdict anyone can read."
                    lead="What was checked, what was found and what it could not check, in that order. The example is an OC Stamp."
                >
                    <VerifyReport
                        as="h3"
                        className="mx-auto max-w-[48rem]"
                        verdict="good"
                        title={
                            <>
                                Signed by <span className="whitespace-nowrap">bc1q9h7g…z5e3w7t</span>, before block 971,632.
                            </>
                        }
                        summary="The signature is valid and the hash is in a Bitcoin block."
                        checks={[
                            { label: 'Envelope is well formed', state: 'ok', note: 'oc-stamp v1' },
                            { label: 'Id matches the content', state: 'ok' },
                            { label: 'Signed by the address', state: 'ok', note: 'BIP-322, native segwit' },
                            { label: 'Anchored to Bitcoin', state: 'ok', note: 'Block 971,632' },
                            { label: 'Bitcoin behind the signer', state: 'skipped', note: 'This stamp carries no attestation.' },
                        ]}
                        notChecked={['That the file you have is the one that was stamped.', 'Who controls the address today.']}
                    />
                </Part>

                <section id="notes" aria-labelledby="notes-title">
                    <Frame padded={false}>
                        <SectionBar as="h2" id="notes-title" start="Notes and releases" end={of(COUNT)} />
                        <DocColumns
                            nav={
                                <Toc
                                    entries={TOC}
                                    aside={
                                        <a href={`${SOURCE}/CHANGELOG.md`} className="oca-label inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                                            Every release →
                                        </a>
                                    }
                                />
                            }
                        >
                            <Prose>
                                <h2 id="releases">Releases</h2>
                                <p>The newest first, each with what it changed, from the package's CHANGELOG.</p>
                                {RELEASES.map((r) => (
                                    <div key={r.version}>
                                        <h3 id={slug(r.version)}>
                                            {r.version}
                                            {r.date ? <span className="text-oca-subtle"> · {day(r.date)}</span> : null}
                                        </h3>
                                        <ul>
                                            {r.lines.map((l) => (
                                                <li key={l}>
                                                    <Line text={l} />
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                <h2 id="contrast">Contrast</h2>
                                <p>
                                    Every text colour clears AA on the grounds it sits on, in light and in dark: 4.5:1, and 3:1 for the display accent, which is used only at display sizes.{' '}
                                    <code>scripts/check-contrast.mjs</code> reads them from <code>tokens.css</code> in the package's tests. On the orange band, text is ink.
                                </p>
                                <h2 id="classic">The classic system</h2>
                                <p>
                                    <code>@orangecheck/design</code>, with its skins, is frozen: fixes only, no new components, no new site on it. Its stories stay under Classic (frozen) for the owner tools
                                    still on it.
                                </p>
                            </Prose>
                        </DocColumns>
                    </Frame>
                </section>
            </PageFrame>
            <SiteFooter
                signature
                fineprint="One design system for orangecheck."
                columns={[
                    {
                        heading: 'The system',
                        links: [
                            { href: '#frame', label: 'Parts' },
                            { href: '#use', label: 'Using it' },
                            { href: '#notes', label: 'Releases' },
                        ],
                    },
                    {
                        heading: 'Source',
                        links: [
                            { href: SOURCE, label: 'GitHub', external: true },
                            { href: 'https://www.npmjs.com/package/@orangecheck/app-design', label: 'npm', external: true },
                        ],
                    },
                    {
                        heading: 'The family',
                        links: [
                            { href: 'https://ochk.app', label: 'ochk.app', external: true },
                            { href: 'https://ochk.io', label: 'ochk.io', external: true },
                            { href: 'https://ochk.io/docs', label: 'Docs', external: true },
                        ],
                    },
                ]}
                meta="MIT · design.ochk.io"
            />
        </>
    ),
};
