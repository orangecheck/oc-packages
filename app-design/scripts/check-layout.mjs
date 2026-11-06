#!/usr/bin/env node
/*
 * What only a real layout shows, measured in Chrome at a phone's width and a
 * desk's: the package's CSS compiled by Tailwind as a site compiles it, the
 * shells rendered by the server, a panel opened in the browser.
 *
 * - A Panel's actions stay top right beside a two-line description, on a
 *   phone and in a half-width panel, rather than wrapping under the text.
 * - An expanded Panel's body scrolls inside itself: a tall body never runs
 *   under the source at the foot.
 * - The app frames (ToolShell variant="app", AppShell variant="rail") clip
 *   what is positioned inside them: an sr-only line deep in a page's own
 *   scroller does not stretch the document past the window. Nor does one in
 *   the last column of a wide table in a ScrollFade widen a phone.
 * - A markdown table fits a phone when its words do: an error-code table
 *   at 390 does not scroll, and no cell spills; one that cannot fit still
 *   scrolls, with the fade.
 * - A DataTable row with a link opens from any of its cells, and a control
 *   in another cell stays its own; a compact HashChip sits in a line under
 *   32px with a 44px target; six wrapping tabs fit a phone; AppShell's
 *   lockup and product word fit its sidebar, and its account bar, first in
 *   the page, still draws top right with the sidebar sticky beside it.
 * - The family footer fits a phone in 600px, its meta line included, each
 *   link group a disclosure with a 44px summary, every link still there; a
 *   desk sees the columns. A product's footer with seven groups fits too.
 * - A block title keeps one button beside it on a phone, level with the
 *   title; a group of three wraps under it.
 * - A ListRow holds a line over its title and two under it; a text action
 *   sits beside them on a desk and under them on a phone, lined up with the
 *   text, never over it. A wide end, in trailing or actions, drops under the
 *   text on a phone rather than squeeze it. A large row (size="lg") has an
 *   18px title, a padded card's air and hairlines inset to its text; a list
 *   in a flush Card runs to the card's edges, lined up with its text.
 * - A docs heading that is one long identifier breaks rather than widen a
 *   phone; a link in prose, a list or a table cell is 24px to press. Each
 *   fallback stack sets text at its webfont's width (prose in four weights,
 *   display type, code), and no measure is in ch, which the fallback narrows.
 * - ListRow stackBelow="sm" gives a phone's long-token title (a bc1q
 *   address) the whole row, the badge under it; a desk's row is unchanged.
 * - On a touch screen a 32px icon button (icon-sm, Copy, a Panel's full
 *   screen), a 36px small button, a 40px icon button and the theme switch
 *   are 44px targets; a mouse sees them unchanged. A small field is drawn
 *   44px tall to a thumb and 36px to a mouse. A HashChip's link is a 44px
 *   target to a thumb, at least 44px wide, and its line keeps its height; so
 *   is a standalone TextLink, and a TextLink in a sentence is not.
 * - SignInFrame holds still while its ceremony grows past the window: the
 *   title stays put, and the ink column is one screen tall with its art in
 *   place.
 * - ./signin's SignInPage, as a tool site serves it, keeps its Go back (the
 *   frame's backTo) a 44px target to a thumb, and its header the frame's
 *   height to a thumb and to a mouse.
 * - A tool site's Docs link is in its phone menu, a 44px target, when the
 *   tools are the tab bar.
 * - A ListRow with lines="all" wraps its title and line in full, stays
 *   44px at least, and keeps its picture and its end level with the title.
 * - A bare border, border-b or divide-y draws in the hairline, not in the
 *   text colour (Tailwind 4's default), in light and dark; a colour utility
 *   still wins.
 * - Every tool page's title starts at one x: ToolShell's wide and narrow
 *   columns, an app page's ToolColumn, and an ErrorPage inside the shell.
 *   A short tool page's footer starts below the window, so content that
 *   arrives after the first paint moves no footer in view.
 * - On a phone the small controls are a thumb's 44px: the compact footer's
 *   lockup, an artifact's Download, Copy and view switch, filter chips, a
 *   menu's items, a row in a pane. A row's actions keep clear of its time.
 * - A read that fails moves nothing: a LoadError given the rows of the
 *   LoadingBlock it replaces keeps their height, and a LoadingBlock that
 *   times out keeps its own, so the line under either stays where it was.
 * - A hero's h1 and lead are opaque on the entrance's first frame, in both
 *   PageHero layouts, a document's header and an ErrorPage, so the first
 *   paint is their LCP; the rest of the entrance still fades in. No entrance
 *   or reveal blurs.
 * - Under reduced motion every entrance and reveal starts at once: no
 *   animation or transition keeps a delay, so nothing holds its first frame.
 * - A hero's two actions stack on a phone, each the column's full width, in
 *   DOM order; from 640px they sit side by side at their own widths. In both
 *   PageHero layouts, a document's header and an ErrorPage.
 *
 * CI runners carry Chrome (CHROME_BIN); locally it uses Playwright's. Run
 * after `yarn build`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compileCss, decodePng } from './browser.mjs';

process.env.NODE_ENV = 'production';
const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/chrome.js'))) {
    console.error('✗ layout: dist is missing; run yarn build first');
    process.exit(1);
}

// Docs prose, a display line and a code token, for the fallback faces' widths.
const FALLBACK_PROSE =
    'The content itself is NOT included in the envelope, only its hash. You ship the envelope alongside the content (archive, filesystem, HTTP, whatever). ' +
    'Hex is chosen so the signed message is legible in wallet UIs: a user signing through UniSat, Xverse, Leather, or Sparrow sees something they can read aloud. ' +
    'Envelopes can be published to Nostr kind-30083 for durable public discovery, but it is optional. A stamp is a self-contained JSON blob; email it, embed it in a git commit message, put it in S3.';
const FALLBACK_HEADLINE = 'Sign in with a Bitcoin wallet. Back it with coins you hold.';
const FALLBACK_CODE = 'application/vnd.orangecheck.stamp+json sha256(canonical(stamp)) 0x1f2e3d4c';

function findChrome() {
    const found = [process.env.OCA_CHROME, process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const cache = join(homedir(), '.cache/ms-playwright');
    if (existsSync(cache)) {
        for (const d of readdirSync(cache).sort().reverse()) {
            found.push(join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell'), join(cache, d, 'chrome-linux64/chrome'));
        }
    }
    return found.find((p) => p && existsSync(p));
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ layout: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'app-design-layout-'));
let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ layout: ${msg}`);
        failures++;
    }
};

// A ch is the face's 0, which the Arial fallback draws 6-12% narrower than Inter's, so a measure in ch moves at the swap.
// Stories too: a story is what a site copies. max-w-prose is 65ch.
{
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const inCh = walk(join(pkg, 'src'))
        .filter((f) => /\.(tsx?|css)$/.test(f))
        .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\[[\d.]+ch\]|:\s*['"]?[\d.]+ch\b|['"][\d.]+ch['"]|\bmax-w-prose\b/g)].map((m) => `${f.slice(pkg.length + 1)}: ${m[0]}`));
    check(inCh.length === 0, `a width in ch moves at the font swap; use em: ${inCh.join(', ')}`);
}

try {
    // The panel, opened in the browser: its dialog renders only on the client.
    const esbuild = require('esbuild');
    writeFileSync(
        join(dir, 'client.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { Panel } from '${join(pkg, 'src/components/figures.tsx')}';\n` +
            `const tall = <div data-tall="" style={{ height: 1600 }}>A body taller than the window</div>;\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <div className="p-4"><Panel title="Hash rate" description="Seven-day average." expandable source={<p data-source="">Source: mempool.space · Updated 2 min ago</p>}>{() => tall}</Panel></div>\n` +
            `);\n`
    );
    // A row's menu, open: Radix draws it only on the client.
    writeFileSync(
        join(dir, 'menu.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '${join(pkg, 'src/primitives/overlay.tsx')}';\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <DropdownMenu defaultOpen modal={false}><DropdownMenuTrigger>Actions</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Rename</DropdownMenuItem><DropdownMenuItem destructive>Forget</DropdownMenuItem></DropdownMenuContent></DropdownMenu>\n` +
            `);\n`
    );
    // A tool site's phone menu, opened in the browser: the Sheet renders only on the client.
    writeFileSync(
        join(dir, 'toolmenu.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { ToolShell } from '${join(pkg, 'src/chrome/tool-shell.tsx')}';\n` +
            `const tools = ['Create', 'Verify', 'Playground'].map((label) => ({ href: '/' + label.toLowerCase(), label, icon: <i /> }));\n` +
            `createRoot(document.getElementById('root')).render(<ToolShell protocol="stamp" tools={tools}><p>page</p></ToolShell>);\n`
    );
    // A read that fails after a moment, and one that never answers: each swaps on the client.
    writeFileSync(
        join(dir, 'loaderr.jsx'),
        `import { useEffect, useState } from 'react';\n` +
            `import { createRoot } from 'react-dom/client';\n` +
            `import { LoadError, LoadingBlock } from '${join(pkg, 'src/components/data.tsx')}';\n` +
            `import { failureText } from '${join(pkg, 'src/format/index.ts')}';\n` +
            `function Fails() {\n` +
            `  const [failed, setFailed] = useState(false);\n` +
            `  useEffect(() => { const t = setTimeout(() => setFailed(true), 400); return () => clearTimeout(t); }, []);\n` +
            `  return failed ? <LoadError title="Your balance did not load." rows={3} onRetry={() => {}}>{failureText(new TypeError('Failed to fetch'))}</LoadError> : <LoadingBlock />;\n` +
            `}\n` +
            `const below = <p data-below="">Under the read</p>;\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <div className="flex flex-col gap-10 p-4"><div data-case="fails"><Fails />{below}</div><div data-case="late"><LoadingBlock timeoutMs={400} onRetry={() => {}} />{below}</div></div>\n` +
            `);\n`
    );
    // Code blocks whose long line scrolls: the scroller becomes a tab stop only once it has measured, on the client.
    writeFileSync(
        join(dir, 'coderegion.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { CodeBlock, CodeTabs } from '${join(pkg, 'src/components/code-block.tsx')}';\n` +
            `const host = 'alice.btc.calendar.opentimestamps.org';\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <div className="flex flex-col gap-6 p-4"><CodeBlock code={'curl https://' + host + '/digest/' + 'f'.repeat(64)} caption="A long line" /><CodeTabs items={[{ label: 'curl', lang: 'bash', code: 'curl https://' + host + '/digest/' + 'e'.repeat(64) }, { label: 'node', lang: 'js', code: 'fetch(url)' }]} /></div>\n` +
            `);\n`
    );
    writeFileSync(
        join(dir, 'dialogclose.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { Dialog, DialogContent, DialogTitle } from '${join(pkg, 'src/primitives/overlay.tsx')}';\n` +
            `createRoot(document.getElementById('root')).render(<Dialog defaultOpen><DialogContent><DialogTitle>A dialog</DialogTitle><p>Its body.</p></DialogContent></Dialog>);\n`
    );
    // Every ScrollFade user, each in a box too narrow for it, so each scrolls and so takes focus: tables under a
    // docs heading (its "#" link is not part of the name) and with a caption, a drawn diagram, two tab lists (one
    // labelled), ProtocolNav and a code block's tabs. And first, with no heading before it, a bare ScrollFade.
    // It is a tab stop but no region, since a region with no name is no landmark.
    writeFileSync(
        join(dir, 'scrollnames.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { ApiTable, Diagram, DocsHeading, MdxTable } from '${join(pkg, 'src/components/docs.tsx')}';\n` +
            `import { ScrollFade } from '${join(pkg, 'src/primitives/scroll-fade.tsx')}';\n` +
            `import { ProtocolNav } from '${join(pkg, 'src/components/protocol.tsx')}';\n` +
            `import { CodeBlock, CodeTabs } from '${join(pkg, 'src/components/code-block.tsx')}';\n` +
            `import { Tabs, TabsList, TabsTrigger } from '${join(pkg, 'src/primitives/tabs.tsx')}';\n` +
            `const wide = 'a_column_name_that_does_not_break';\n` +
            `const mermaid = { initialize() {}, render: async () => ({ svg: '<svg width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 900px;" viewBox="0 0 900 120"><rect width="900" height="120" fill="none" stroke="currentColor"/></svg>' }) };\n` +
            `const tabs = (label) => <Tabs defaultValue="t0"><TabsList aria-label={label}>{Array.from({ length: 12 }, (_, i) => <TabsTrigger key={i} value={'t' + i}>{'Layer ' + i}</TabsTrigger>)}</TabsList></Tabs>;\n` +
            `const box = (k, el) => <div data-box={k} style={{ width: 260 }}>{el}</div>;\n` +
            `createRoot(document.getElementById('root')).render(<div className="flex flex-col gap-8 p-4">\n` +
            `  {box('unnamed', <ScrollFade><p style={{ width: 900 }}>{wide}</p></ScrollFade>)}\n` +
            `  <section><DocsHeading as="h2" id="parameters">Parameters</DocsHeading>{box('mdx', <MdxTable><thead><tr><th>{wide}</th><th>{wide}</th><th>{wide}</th></tr></thead><tbody><tr><td>{wide}</td><td>{wide}</td><td>{wide}</td></tr></tbody></MdxTable>)}</section>\n` +
            `  {box('api', <ApiTable caption="Options" rows={[{ name: wide + wide, type: wide, description: wide + ' ' + wide }]} />)}\n` +
            `  {box('diagram', <Diagram chart="flowchart LR; a-->b" caption="A flow" load={async () => mermaid} />)}\n` +
            `  {box('tabs', tabs('Desk'))}\n` +
            `  {box('tabs-bare', tabs(undefined))}\n` +
            `  {box('protocols', <ProtocolNav current="lock" />)}\n` +
            `  {box('codetabs', <CodeTabs items={Array.from({ length: 8 }, (_, i) => ({ label: 'version-' + i, lang: 'js', code: 'x' }))} />)}\n` +
            `  {box('code', <CodeBlock code={'curl https://' + wide + '/' + 'f'.repeat(64)} caption="A long line" />)}\n` +
            // A heading that ends in a "#" as text, which is not part of its name; and a scroller in a section of its own
            // with no heading, after a section that has one: that heading names its own section, not this scroller.
            `  <section><h2>Fees #</h2>{box('hash-text', <ScrollFade><p style={{ width: 900 }}>{wide}</p></ScrollFade>)}</section>\n` +
            `  <section><h2>An earlier part</h2></section>\n` +
            `  <section>{box('sectioned', <ScrollFade><p style={{ width: 900 }}>{wide}</p></ScrollFade>)}</section>\n` +
            `</div>);\n`
    );
    // A ParticlePortrait with its notes, in a figure as wide as its stage: a desk's labels beside the square only where
    // they fit there. Its story's labels, the widest 232px.
    writeFileSync(
        join(dir, 'portrait.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { ParticlePortrait, PORTRAIT_ANCHORS } from '${join(pkg, 'src/motion/index.ts')}';\n` +
            `const notes = [['eye', 'A note on a hairline leader'], ['hair', 'Dots from a generated portrait', 'right'], ['jaw', 'Real text, not canvas'], ['shoulder', 'It sleeps once formed'], ['chest', 'Pause it any time']].map(([k, label, side]) => ({ at: PORTRAIT_ANCHORS[k], label, side }));\n` +
            `createRoot(document.getElementById('root')).render(<ParticlePortrait alt="A person drawn in dots" className="h-[44rem]" callouts={notes} />);\n`
    );
    // The census: every story, each the package's own use of its components, rendered on the client in a
    // box of its own. A transform makes the box the containing block, so a fixed bar stays inside its story.
    const stories = (function walk(d) {
        return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.stories.tsx') ? [join(d, e.name)] : []));
    })(join(pkg, 'src'))
        // pages/ holds hand-built page mocks, whose own markup is not the package's to size.
        .filter((f) => !f.includes('/src/pages/'))
        // SignIn's stories draw @orangecheck/me-client's button, whose size is that package's to set.
        .filter((f) => !f.endsWith('/src/brand/SignIn.stories.tsx'))
        .sort();
    writeFileSync(
        join(dir, 'census.jsx'),
        `import { Component, useEffect, useRef, useState } from 'react';\n` +
            `import { createPortal } from 'react-dom';\n` +
            `import { createRoot } from 'react-dom/client';\n` +
            stories.map((f, i) => `import * as S${i} from '${f}';\n`).join('') +
            `class Boundary extends Component { state = { failed: null }; static getDerivedStateFromError(e) { return { failed: String(e?.message ?? e).slice(0, 120) }; } render() { return this.state.failed ? <p data-story-failed={this.state.failed}>failed</p> : this.props.children; } }\n` +
            `const files = [${stories.map((f, i) => `['${f.slice(pkg.length + 5).replace(/\.stories\.tsx$/, '')}', S${i}]`).join(', ')}];\n` +
            `const all = files.flatMap(([file, mod]) => Object.entries(mod).filter(([k, s]) => k !== 'default' && s && typeof s.render === 'function').map(([k, s]) => [file + '/' + k, s]));\n` +
            `function Story({ s }) { return s.render(s.args ?? {}, { args: s.args ?? {}, globals: { mode: 'light' }, parameters: s.parameters ?? {} }); }\n` +
            // A story whose dialog is held open (Docs/Search) hides the rest of the page, so it is read on a page of its own.\n` +
            `const MODAL = ['components/Docs/Search'];\n` +
            `const shown = all.filter(([name]) => MODAL.includes(name) === (location.hash === '#modal'));\n` +
            // Plants, read apart from the stories: three the census must find small (a card's title link alone in its
            // heading, a 13px checkbox and a 20px icon button in a list item) and one it must exempt (a link in a sentence).
            `const plants = location.hash === '#modal' ? null : <div data-plants="" className="flex flex-col gap-8 p-4">` +
            `<ul data-plant="card-title"><li className="flex flex-col gap-2 border border-border p-5"><h3 className="oca-title"><a href="#plant">OC Stamp</a></h3><p className="text-[0.9375rem] text-muted-foreground">Sign a file’s hash with a Bitcoin address, anchored to a block.</p></li></ul>` +
            `<ul data-plant="checkbox-li"><li><label><input type="checkbox" style={{ width: 13, height: 13 }} /> Remember this device for thirty days</label></li></ul>` +
            `<ul data-plant="icon-button-li"><li>Copy the receiving address to your clipboard <button type="button" aria-label="Copy the address" className="inline-flex size-5 items-center justify-center">+</button></li></ul>` +
            `<p data-plant="sentence-link">Read the <a href="#plant">full specification</a> before you sign anything with this key.</p>` +
            // And for a mouse's 24px: two 16px icon buttons 2px apart, small to either pointer, and one alone, which a
            // mouse lets off by WCAG 2.5.8's spacing.
            `<div data-plant="crowded-icons" className="flex gap-0.5"><button type="button" aria-label="Previous page" className="inline-flex size-4 items-center justify-center">‹</button><button type="button" aria-label="Next page" className="inline-flex size-4 items-center justify-center">›</button></div>` +
            `<div data-plant="lone-icon"><button type="button" aria-label="Dismiss the note" className="inline-flex size-4 items-center justify-center">×</button></div>` +
            `</div>;\n` +
            // Trigger plants, stories of their own, for the settle rule. Each shows its 48px target behind its trigger, and
            // a link shows by itself while it is open, timed from the press, that stays once it shuts: in the trigger's own
            // story under its layer, and in another story under a layer over the screen. The first layer stays a moment
            // after it shuts (until the next press), as an overlay on its way out does. A link let go once and gone by the
            // next trigger's shut is that trigger's in no way; what a details shows in the page is its own though it hides.
            `const T48 = { display: 'inline-flex', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' };\n` +
            `function useEscape(open, shut) { useEffect(() => { if (!open) return; const k = (e) => e.key === 'Escape' && shut(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open]); }\n` +
            `function DoorOwn() { const [open, setOpen] = useState(false); const [drawn, setDrawn] = useState(false); const [late, setLate] = useState(false); const [gone, setGone] = useState(false); useEscape(open, () => setOpen(false));\n` +
            `useEffect(() => { const go = () => setGone(true); window.addEventListener('oca-plant-door-other-shut', go); return () => window.removeEventListener('oca-plant-door-other-shut', go); }, []);\n` +
            `useEffect(() => { if (open) { setDrawn(true); const t = setTimeout(() => setLate(true), 50); return () => clearTimeout(t); } const go = () => setDrawn(false); document.addEventListener('pointerdown', go, { capture: true, once: true }); return () => document.removeEventListener('pointerdown', go, { capture: true }); }, [open]);\n` +
            `return <div style={{ height: 160, padding: 16, display: 'flex', gap: 16 }}><button type="button" aria-label="Open the note" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={T48}>+</button>{late ? <span data-plant="late-own"><a href="#plant" style={T48}>Late</a></span> : null}{late && !gone ? <span data-plant="late-gone"><a href="#plant" style={T48}>Gone</a></span> : null}{drawn ? <div data-plant="door-content" style={{ position: 'fixed', inset: 0, background: 'white', padding: 16 }}><a href="#plant" style={T48}>Note</a></div> : null}</div>; }\n` +
            `function DoorOther() { const [open, setOpen] = useState(false); const was = useRef(false); useEscape(open, () => setOpen(false));\n` +
            `useEffect(() => { if (open) window.dispatchEvent(new Event('oca-plant-door-other')); else if (was.current) window.dispatchEvent(new Event('oca-plant-door-other-shut')); was.current = open; }, [open]);\n` +
            `return <div style={{ height: 96, padding: 16 }}><button type="button" aria-label="Open the cover" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={T48}>+</button>{open ? createPortal(<div data-plant="door-cover" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'white', padding: 16 }}><a href="#plant" style={T48}>Cover</a></div>, document.body) : null}</div>; }\n` +
            `function LateOther() { const [late, setLate] = useState(false); useEffect(() => { let t; const go = () => { t = setTimeout(() => setLate(true), 50); }; window.addEventListener('oca-plant-door-other', go); return () => { window.removeEventListener('oca-plant-door-other', go); clearTimeout(t); }; }, []);\n` +
            `return <div style={{ height: 96, padding: 16 }}>{late ? <span data-plant="late-other"><a href="#plant" style={T48}>Late</a></span> : null}</div>; }\n` +
            `function DoorInline() { return <details style={{ padding: 16 }}><summary style={T48}>More</summary><span data-plant="door-inline"><a href="#plant" style={T48}>Inline</a></span></details>; }\n` +
            // A panel its trigger hides again in place, by aria-hidden or inert, as it shuts: still drawn, the trigger's.
            `function DoorHide({ how }) { const [open, setOpen] = useState(false); const [drawn, setDrawn] = useState(false); useEscape(open, () => setOpen(false)); useEffect(() => { if (open) setDrawn(true); }, [open]);\n` +
            `const off = drawn && !open ? (how === 'inert' ? { inert: true } : { 'aria-hidden': 'true' }) : {};\n` +
            `return <div style={{ height: 96, padding: 16, display: 'flex', gap: 16 }}><button type="button" aria-label="Open the panel" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={T48}>+</button>{drawn ? <span data-plant={'door-' + how} {...off}><a href="#plant" style={T48}>Panel</a></span> : null}</div>; }\n` +
            // The door that shuts slowly comes before the other, whose press clears its layer.
            `const doors = plants ? [['plant/door-own', DoorOwn], ['plant/late-other', LateOther], ['plant/door-other', DoorOther], ['plant/door-inline', DoorInline], ['plant/door-hidden', () => <DoorHide how="hidden" />], ['plant/door-inert', () => <DoorHide how="inert" />]] : [];\n` +
            `createRoot(document.getElementById('root')).render(<div>{shown.map(([name, s]) => <div key={name} data-story={name} style={{ transform: 'translateZ(0)', margin: '64px 0' }}><Boundary><Story s={s} /></Boundary></div>)}{doors.map(([name, D]) => <div key={name} data-story={name} style={{ transform: 'translateZ(0)', margin: '64px 0' }}><D /></div>)}{plants}</div>);\n`
    );
    esbuild.buildSync({
        entryPoints: [join(dir, 'census.jsx')],
        outfile: join(dir, 'census.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'scrollnames.jsx')],
        outfile: join(dir, 'scrollnames.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'portrait.jsx')],
        outfile: join(dir, 'portrait.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'dialogclose.jsx')],
        outfile: join(dir, 'dialogclose.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'coderegion.jsx')],
        outfile: join(dir, 'coderegion.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        // The highlighter reads process.env outside its bundler.
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'loaderr.jsx')],
        outfile: join(dir, 'loaderr.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'toolmenu.jsx')],
        outfile: join(dir, 'toolmenu.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        // next/link reads process.env outside its bundler.
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'menu.jsx')],
        outfile: join(dir, 'menu.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'client.jsx')],
        outfile: join(dir, 'client.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });

    // The package's CSS, compiled the way a site compiles it, with the client bundles' classes and the
    // fonts beside it, as a site serves them: measured in Inter, not in whatever the machine falls back to.
    // A site's own rounded steps, in its source as a site writes them: the theme squares every one.
    const RADII = ['rounded', 'rounded-xs', 'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-4xl'];
    writeFileSync(join(dir, 'radii.js'), `export const radii = ${JSON.stringify(RADII.join(' '))};\n`);
    compileCss(dir, ['client', 'menu', 'toolmenu', 'loaderr', 'coderegion', 'dialogclose', 'scrollnames', 'census', 'portrait', 'radii']);
    // No custom property in the compiled CSS refers to itself: that is a cycle, invalid wherever nothing
    // overrides it. 2.3.2's theme emitted --radius: var(--radius) for a bare rounded.
    {
        const css = readFileSync(join(dir, 'out.css'), 'utf8');
        const loops = [...css.matchAll(/(--[\w-]+)\s*:([^;{}]*)/g)].filter(([, n, v]) => new RegExp(`var\\(\\s*${n}\\s*[,)]`).test(v)).map(([d]) => d.trim());
        check(css.includes('border-radius: var(--radius)') && loops.length === 0, `the compiled CSS holds a custom property that refers to itself, or no bare rounded: ${[...new Set(loops)].join('; ') || 'rounded not compiled'}`);
    }

    // The server's markup for the shells and a panel's header.
    const { createElement: h } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const C = require(join(pkg, 'dist/components.js'));
    const Ch = require(join(pkg, 'dist/chrome.js'));
    // Every page written here is loaded through visit (so its small-text and state checks run): the guard at the end.
    const written = new Set();
    const visited = new Set();
    const page = (name, body, script = '') => {
        written.add(pathToFileURL(join(dir, `${name}.html`)).href);
        writeFileSync(
            join(dir, `${name}.html`),
            `<!doctype html><html data-oc-app="ochk"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head><body>${body}${script}</body></html>`
        );
        return pathToFileURL(join(dir, `${name}.html`)).href;
    };
    const describe = 'The network’s total hashing power, a seven-day average, and how it moved over the window you picked.';
    const panel = (title) =>
        h(C.Panel, { title, description: describe, expandable: true, actions: h('button', { type: 'button', 'data-range': '' }, '1Y') }, h('p', null, 'chart'));
    const header = page('header', renderToStaticMarkup(h('div', { className: 'oca-container py-6' }, h('div', { className: 'grid gap-6 md:grid-cols-2' }, panel('Hash rate'), panel('Difficulty')))));
    // A page's own scroller, as agent's compose page has: numbered sections whose
    // titles read "Step N:" and an outside link, both sr-only text, deep inside it.
    const deep = h(
        'div',
        { className: 'min-h-0 flex-1 overflow-y-auto' },
        h(
            'div',
            { className: 'mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6' },
            ...Array.from({ length: 6 }, (_, i) =>
                h(
                    C.FormSection,
                    { key: i, n: i + 1, title: `Section ${i + 1}`, hint: 'What goes here.' },
                    h('div', { style: { height: 260 } }, h(C.TextLink, { href: 'https://ochk.io/docs/agent' }, 'Read the spec'))
                )
            )
        )
    );
    const tool = page('tool-app', renderToStaticMarkup(h(Ch.ToolShell, { protocol: 'agent', tools: [], variant: 'app' }, deep)));
    const rail = page(
        'rail',
        renderToStaticMarkup(
            h(Ch.AppShell, { variant: 'rail', header: h('header', { className: 'h-14 border-b' }, 'chat'), nav: [{ items: [{ href: '/a', label: 'A', icon: h('i') }, { href: '/b', label: 'B', icon: h('i') }] }] }, deep)
        )
    );
    // A wide table in a ScrollFade, an outside link in its last column: a phone must not widen.
    const P = require(join(pkg, 'dist/primitives.js'));
    const wide = page(
        'wide',
        renderToStaticMarkup(
            h('div', { className: 'p-4' }, h(P.ScrollFade, null, h('table', { style: { width: 1800 } }, h('tbody', null, h('tr', null, h('td', { style: { width: 1700 } }, 'Name'), h('td', null, h(C.TextLink, { href: 'https://mempool.space' }, 'Source')))))))
        )
    );
    const expanded = page('expanded', '<div id="root"></div>', '<script src="client.js"></script>');
    // Markdown tables as the docs write them: one that fits a phone, one that cannot.
    const { mdxComponents: M } = require(join(pkg, 'dist/mdx.js'));
    const mdTable = (head, rows) =>
        h(M.table, null, h('thead', null, h('tr', null, ...head.map((x, i) => h(M.th ?? 'th', { key: i }, x)))), h('tbody', null, ...rows.map((r, i) => h('tr', { key: i }, ...r.map((c, j) => h(M.td ?? 'td', { key: j }, c))))));
    const tables = page(
        'tables',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'p-4' },
                h('div', { 'data-t': 'fits' }, mdTable([h(M.code, null, 'code'), 'Status', 'What it means'], [
                    [h(M.code, null, 'oc_session_expired_or_revoked'), '401', 'The session ended. Sign in again.'],
                    [h(M.code, null, 'oc.vault.entitlement_missing'), '402', 'No plan covers this. See /pricing.'],
                    [h(M.code, null, 'https://ochk.io/api/auth/revocations'), '200', 'The feed of ended sessions.'],
                ])),
                // The package's other small parents, each holding inline code: a caption, a MonoLabel, a SectionBar.
                h('div', { 'data-t': 'small' },
                    h('table', null, h(M.caption ?? 'caption', { className: 'text-[0.75rem]' }, 'Codes, ', h(M.code, null, 'oc_*'))),
                    h(C.MonoLabel, null, 'Status ', h(M.code, null, '401')),
                    h(C.SectionBar, { start: h('span', null, 'Field ', h(M.code, null, 'did')), end: h(M.code, null, 'v1') })
                ),
                h('div', { 'data-t': 'wide' }, mdTable(['A', 'B', 'C', 'D', 'E', 'F'], [
                    ['first_column_value', 'second_column_value', 'third_column_value', 'fourth_column_value', 'fifth_column_value', 'sixth_column_value'].map((x) => h(M.code, null, x.replace(/_/g, ''))),
                ]))
            )
        )
    );
    // 1.9.0: a clickable table, a compact chip in a line, six wrapping tabs, a product word in the sidebar.
    const parts190 = page(
        'parts190',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-6 p-4' },
                h(C.DataTable, {
                    columns: [
                        { key: 'name', header: 'Name', cell: (r) => r.name, primary: true },
                        { key: 'id', header: 'Id', cell: (r) => h('button', { type: 'button', 'data-copy': '' }, r.id) },
                        { key: 'when', header: 'When', cell: () => '2 days ago' },
                    ],
                    rows: [{ name: 'Ada', id: 'a1' }],
                    rowKey: (r) => r.id,
                    rowHref: (r) => `/people/${r.id}`,
                }),
                h(P.DensityProvider, { density: 'compact' }, h('p', { 'data-line': '', className: 'text-[0.875rem]' }, 'Signed by ', h(C.HashChip, { value: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t' }))),
                h(P.Tabs, { defaultValue: 'nodes' }, h(P.TabsList, { wrap: true, 'data-wrap': '' }, ...['Nodes', 'Blocks', 'Mempool', 'Lightning', 'Mining', 'Fees'].map((t) => h(P.TabsTrigger, { key: t, value: t.toLowerCase() }, t))))
            )
        )
    );
    const productShell = page(
        'product-shell',
        renderToStaticMarkup(h(Ch.AppShell, { product: 'vault', family: 'vault', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }] }, h('p', null, 'page')))
    );
    // The account bar first in the page, drawn top right; a page long enough to scroll the sidebar's stickiness.
    const deskShell = page(
        'desk-shell',
        renderToStaticMarkup(
            h(Ch.AppShell, { product: 'ochk.app', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }], account: h('button', { type: 'button', 'data-account': '' }, 'Account'), banner: h('p', { 'data-banner': '' }, 'banner') }, h('div', { style: { height: '3000px' } }, 'page'))
        )
    );
    const footer = page('footer', renderToStaticMarkup(h(Ch.OchkIoFooter)));
    // A product's footer as vault draws it: three columns of its own, the family's four, the legal row.
    const productFooter = page(
        'product-footer',
        renderToStaticMarkup(
            h(Ch.SiteFooter, {
                columns: ['Vault', 'Docs', 'Source'].map((heading) => ({ heading, links: [1, 2, 3].map((i) => ({ href: `/${heading.toLowerCase()}/${i}`, label: `${heading} ${i}` })) })),
                family: true,
                legal: ['Privacy', 'Terms', 'Security', 'Trademarks', 'Contact'].map((label) => ({ href: `/${label.toLowerCase()}`, label })),
                fineprint: 'A password manager, encrypted in your browser. We store only what we cannot read.',
            })
        )
    );
    // Block titles in a phone's column: a button stays beside its title; a wide group wraps under.
    const titles = page(
        'titles',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-10 px-4 py-6' },
                h('div', { 'data-t': 'one' }, h(C.SectionTitle, { title: 'Payout addresses', description: 'Where your earnings go, and when they last moved.', action: h(P.Button, { size: 'sm', variant: 'secondary' }, 'Add address') })),
                h('div', { 'data-t': 'many' }, h(C.SectionTitle, { title: 'Keys', action: h('div', { className: 'flex gap-2' }, ...['Import', 'Generate', 'Export all'].map((l) => h(P.Button, { key: l, size: 'sm', variant: 'secondary' }, l))) }))
            )
        )
    );
    // A sign-in whose ceremony grows as it mounts: from one line to taller than the window.
    const signinGrow = page('signin-grow', renderToStaticMarkup(h(Ch.SignInFrame, { title: 'Sign in', lead: 'One line under the title.' }, h('div', { 'data-ceremony': '', style: { height: '40px' } }, 'Checking your session'))));
    // Fields in a tool's compact density, a small one set by hand, and a default one.
    const fields = page(
        'fields',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-4 p-6' },
                h(P.DensityProvider, { density: 'compact' }, h(P.Input, { 'data-f': 'compact', 'aria-label': 'Attestation id' }), h(P.Select, null, h(P.SelectTrigger, { 'data-f': 'select', 'aria-label': 'Network' }, h(P.SelectValue, { placeholder: 'Mainnet' })))),
                h(P.Input, { size: 'sm', 'data-f': 'sm', 'aria-label': 'Small' }),
                h(P.Input, { 'data-f': 'md', 'aria-label': 'Default' })
            )
        )
    );
    // 2.0's header CTA while a session check runs, and after: the same box, the nav where it was.
    const ctaHeader = (cta) =>
        h(Ch.SiteHeader, {
            nav: [
                { href: '/how', label: 'How it works' },
                { href: '/apps', label: 'For apps' },
            ],
            signIn: true,
            cta,
        });
    const ctaSwap = page(
        'cta-swap',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h('div', { 'data-cta-case': 'pending' }, ctaHeader({ label: 'Open your vault', pending: true, reserve: ['Open chat'] })),
                h('div', { 'data-cta-case': 'resolved' }, ctaHeader({ label: 'Open chat', href: '/app', reserve: ['Open your vault'] }))
            )
        )
    );
    // A phone's header with the family's longest product word, signed in with a long email: the site header with
    // its account block, the same given a site's own CTA too (it gives way to the account), and the tool header.
    // Nothing may run off the row or under the next part.
    const Fam = require(join(pkg, 'dist/family.js'));
    const longest = Fam.FAMILY.map((s) => s.label)
        .filter((l) => !l.includes('.'))
        .sort((a, b) => b.length - a.length)[0];
    const signedIn = h(Ch.SessionAccountView, { state: 'in', name: 'ana@example.com' });
    const narrow = page(
        'header-narrow',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h('div', { 'data-hdr': 'site' }, h(Ch.SiteHeader, { product: longest, family: true, nav: [{ href: '/how', label: 'How it works' }], account: signedIn })),
                // As chat and vault composed it before 2.2: the family menu, the account, and the site's own CTA.
                h(
                    'div',
                    { 'data-hdr': 'site-cta' },
                    h(Ch.SiteHeader, { product: longest, family: true, nav: [{ href: '/how', label: 'How it works' }], account: signedIn, cta: { label: 'Open your vault', href: '/vault' } })
                ),
                h('div', { 'data-hdr': 'tool' }, h(Ch.SiteHeader, { variant: 'tool', product: longest, family: true, actions: h(Ch.ThemeToggle, {}), account: signedIn }))
            )
        )
    );
    // 2.0's chrome at a desk: every control in the header and every link in a footer column is 44px
    // tall; the legal row is a line of inline text links, held to WCAG 2.5.8's 24px.
    const chromeTargets = page(
        'chrome-targets',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }, { href: '/apps', label: 'For apps' }], family: true, actions: h(Ch.ThemeToggle, {}), signIn: true, cta: true }),
                h(Ch.SiteFooter, { legal: true, columns: [{ heading: 'Product', links: [{ href: '/how', label: 'How it works' }, { href: '/apps', label: 'For apps' }] }] })
            )
        )
    );
    // The signed-in chrome on a phone: AppShell's bar (menu, home lockup, account menu), and the
    // small controls an app page holds (a Switch, a Checkbox, pill Tabs).
    const signedInTargets = page(
        'signed-in-targets',
        renderToStaticMarkup(
            h(
                Ch.AppShell,
                { product: 'ochk.app', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }], account: h(Ch.AccountMenu, { name: 'Ada Lovelace', items: [{ label: 'Sign out', onSelect: () => {} }] }) },
                h(
                    'div',
                    { className: 'flex flex-col items-start gap-8 p-6' },
                    h(P.Switch, { 'data-t': 'switch', 'aria-label': 'Alerts' }),
                    h(P.Checkbox, { 'data-t': 'checkbox', 'aria-label': 'Agree' }),
                    h(P.Tabs, { defaultValue: 'a' }, h(P.TabsList, null, h(P.TabsTrigger, { value: 'a', 'data-t': 'tab' }, 'Entries'), h(P.TabsTrigger, { value: 'b' }, 'Keys')))
                )
            )
        )
    );
    // StatRow with the long values ochk.app's trust group shows: sats totals and a phrase.
    const LONG_STATS = [
        { label: 'Earned, waiting', value: '12,345,678 sats' },
        { label: 'Paid out, all time', value: '987,654,321 sats' },
        { label: 'Signing threshold', value: '2 of 3' },
        { label: 'Who you trust', value: 'Bitcoin and two operators' },
    ];
    const statRows = page(
        'stat-rows',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-10 p-4' },
                h(C.StatRow, { 'data-t': 'md', columns: 4, items: LONG_STATS }),
                h(C.StatRow, { 'data-t': 'sm', columns: 4, size: 'sm', items: LONG_STATS })
            )
        )
    );
    // PageHero's S10 layout, as the legal pages use it: a two-line title, a lead and a mark.
    const s10Page = page(
        's10',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }] }),
                h(C.PageHero, {
                    layout: 's10',
                    size: 'xl',
                    eyebrow: 'Legal',
                    title: 'Privacy policy',
                    lead: 'What we keep, what we never see, and how long anything stays.',
                    art: h('div', { 'data-art': '', style: { width: '96px', height: '96px', background: 'currentColor' } }),
                }),
                h('p', { className: 'p-6' }, 'The policy.')
            )
        )
    );
    // The footer's lines of inline links: the legal row, and a tool's protocol row in the compact footer.
    const footRows = page(
        'foot-rows',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteFooter, { legal: true, columns: [{ heading: 'Product', links: [{ href: '/how', label: 'How it works' }] }] }),
                h(Ch.SiteFooter, { compact: true, family: true, legal: true }),
                // The same pattern elsewhere: a breadcrumb trail and filter chips.
                h(
                    'div',
                    { className: 'flex flex-col gap-6 p-6' },
                    h(C.Breadcrumbs, { items: [{ label: 'Docs', href: '/docs' }, { label: 'Stamp', href: '/docs/stamp' }, { label: 'Verify' }] }),
                    h(C.FilterChips, { label: 'Status', value: 'all', onChange: () => {}, options: [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }] })
                )
            )
        )
    );
    // States chosen in script as well as by a class variant: AppShell's section switcher and current page,
    // a pill tab, a pressed chip. The rendered state check reads each in light and in dark.
    const statesPage = page(
        'states',
        renderToStaticMarkup(
            h(
                Ch.AppShell,
                {
                    product: 'ochk.app',
                    activeSection: 'keys',
                    sections: [
                        { id: 'keys', label: 'Keys', href: '/keys', groups: [{ items: [{ href: '/keys', label: 'Entries', active: true }, { href: '/keys/new', label: 'New' }] }] },
                        { id: 'apps', label: 'Apps', href: '/apps', groups: [{ items: [{ href: '/apps', label: 'Apps' }] }] },
                    ],
                },
                h(
                    'div',
                    { className: 'flex flex-col items-start gap-6 p-6' },
                    h(P.Tabs, { defaultValue: 'a', look: 'pill' }, h(P.TabsList, null, h(P.TabsTrigger, { value: 'a' }, 'Entries'), h(P.TabsTrigger, { value: 'b' }, 'Keys'))),
                    h(C.FilterChips, { label: 'Status', value: 'open', onChange: () => {}, options: [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }] })
                )
            )
        )
    );
    // The docs rail: a row is the rail's width, and 44px tall to a thumb.
    const docsRail = page(
        'docs-rail',
        renderToStaticMarkup(
            h(Ch.DocsShell, { nav: [{ label: 'Start', items: [{ href: '/docs', label: 'Docs' }, { href: '/docs/me', label: 'me' }, { href: '/docs/stamp', label: 'Stamp' }] }], current: '/docs/me' }, h('h1', null, 'me'))
        )
    );
    // Underline tabs with short labels (btc's desk: DCA, Paper) above a sign-in frame's header: its lockup and Back to home.
    const touchShapes = page(
        'touch-shapes',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(P.Tabs, { look: 'line', defaultValue: 'dca' }, h(P.TabsList, null, ['DCA', 'Paper', 'Overview'].map((l) => h(P.TabsTrigger, { key: l, value: l.toLowerCase(), 'data-t': 'line-tab' }, l)))),
                h(Ch.SignInFrame, { lead: 'One line.' }, h('p', null, 'The ceremony.'))
            )
        )
    );
    // ./signin's page as a tool site serves it, prerendered: its Go back is the frame's backTo, a 44px target to a thumb.
    const { SignInPage } = require(join(pkg, 'dist/signin.js'));
    const touchSignInPage = page('touch-signin-page', renderToStaticMarkup(h(SignInPage, { protocol: 'lock', defaultReturnTo: '/app' })));
    // A site header with short nav words (ochk.app's Earn and Trust): its nav shows from 1024, where a tablet is touch.
    const touchNav = page('touch-nav', renderToStaticMarkup(h(Ch.SiteHeader, { nav: [{ href: '/earn', label: 'Earn' }, { href: '/trust', label: 'Trust' }], signIn: true, cta: true })));
    // Block heights as globe's feed sets them, eight cards in a grid, and two in one line of small text (BlockCountdown's
    // "Target · tip"): each link is a line of text, so its target is a ::before, and no two may share a pixel.
    const heights = [971632, 971631, 971630, 971629, 971628, 971627, 971626, 971625];
    const touchHeights = page(
        'touch-heights',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-6 p-4' },
                h(
                    'ol',
                    { className: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' },
                    heights.map((n) => h('li', { key: n, className: 'flex items-baseline justify-between gap-2 border border-border p-4' }, h(C.BlockHeight, { height: n, className: 'text-[1.125rem]' }), h('span', null, '3 min ago')))
                ),
                h('p', { className: 'text-[0.8125rem]' }, 'Target ', h(C.BlockHeight, { height: 972000 }), ' · tip ', h(C.BlockHeight, { height: 971632 }))
            )
        )
    );
    // An app shell's sidebar (its lockup, the section switcher, the page rows) and a rail of icons.
    const shellSections = [
        { id: 'a', label: 'Apps', href: '/a', groups: [{ items: [{ href: '/a', label: 'Entries', active: true }, { href: '/b', label: 'Keys' }] }] },
        { id: 'm', label: 'Money', href: '/m', groups: [{ items: [{ href: '/m', label: 'Payouts' }] }] },
    ];
    const touchShell = page('touch-shell', renderToStaticMarkup(h(Ch.AppShell, { product: 'ochk.app', sections: shellSections, activeSection: 'a' }, h('p', null, 'x'))));
    const icon = h('svg', { viewBox: '0 0 10 10' }, h('rect', { width: 10, height: 10 }));
    const touchRail = page(
        'touch-rail',
        renderToStaticMarkup(h(Ch.AppShell, { variant: 'rail', nav: [{ items: [{ href: '/c', label: 'Chats', icon, active: true }, { href: '/s', label: 'Settings', icon }] }] }, h('p', null, 'x')))
    );
    // Reflow: shapes that moved a page sideways. A framed Section clipped 4px out on both axes (its focus
    // reach), so a glow at the frame's edge scrolled a frame-wide page by that much: the drawn windows of
    // chat's and vault's heroes from 768, and ochk.io /about's tilting mark at 320. Each in a PageFrame and bare.
    const Br = require(join(pkg, 'dist/brand.js'));
    const glowWindow = (props, tall) => h(C.BrowserFrame, { url: 'ochk.io', glow: true, ...props }, h('div', { style: { height: tall } }, 'A drawn window'));
    const reflowShapes = [
        ['a hero with a glowing window', h(C.PageHero, { title: 'Notes that know who wrote them.', lead: 'A lead.', art: glowWindow({}, 240) })],
        // chat's: an ink hero, a paper window.
        ['chat hero', h(C.PageHero, { ground: 'ink', title: 'Messages only they can read.', lead: 'A lead.', art: glowWindow({ variant: 'paper' }, 260) })],
        // vault's: the window centred in its column at max-w-md, a proof row in an unpadded Frame under it.
        [
            'vault hero',
            h(
                'div',
                null,
                h(C.PageHero, { title: 'A vault only you can open.', lead: 'A lead.', art: h('div', { className: 'relative min-w-0' }, glowWindow({ variant: 'paper', className: 'mx-auto w-full max-w-md' }, 200)) }),
                h(C.Frame, { padded: false }, h('ul', { className: 'grid grid-cols-2 gap-px bg-border' }, ['One', 'Two', 'Three', 'Four'].map((l) => h('li', { key: l, className: 'bg-background p-4' }, l))))
            ),
        ],
        // ochk.io /about's: a 300px mark that tilts, its glow 120% of it, in a framed section.
        ['IsoCheck in a framed section', h(C.Section, { framed: true }, h('div', { className: 'flex justify-center' }, h(Br.IsoCheck, { size: 300, tilt: true })))],
    ];
    const reflowPages = reflowShapes.flatMap(([name, el], i) => [
        [`${name} in a PageFrame`, page(`reflow-${i}-frame`, renderToStaticMarkup(h(C.PageFrame, null, el)))],
        [`${name}, bare`, page(`reflow-${i}-bare`, renderToStaticMarkup(el))],
    ]);
    // A legal page whose words include a hostname wider than a phone (ochk.io's privacy and terms ran 30px past 320).
    const HOST = 'alice.btc.calendar.opentimestamps.org';
    const legalLong = page(
        'legal-long',
        renderToStaticMarkup(
            h(C.LegalDocument, {
                doc: {
                    eyebrow: 'Legal',
                    title: 'Privacy',
                    description: 'What we keep.',
                    effective: '1 January 2026',
                    updated: '4 November 2026',
                    sections: [
                        {
                            id: 'stamps',
                            heading: 'Timestamps',
                            blocks: [
                                { kind: 'para', text: `Your browser sends the claim's fingerprint to ${HOST}, at https://${HOST}/digest.` },
                                { kind: 'bullets', items: [`The calendars: ${HOST} and bob.btc.calendar.opentimestamps.org`, { k: 'Relay', v: `wss://relay.${HOST}` }] },
                            ],
                        },
                        { id: 'more', heading: 'More', blocks: [{ kind: 'para', text: 'Short.' }] },
                    ],
                },
            })
        )
    );
    // A generated SDK README in DocsShell, from the MDX map as docs.ochk.io draws it: links that are one identifier
    // each (me-client's ran 79px past 320), beside a fence and a table whose long words must still scroll sideways.
    const LONG_NAME = 'FederationMigrationCancelledWebhookPayload';
    const docsLong = page(
        'docs-long',
        renderToStaticMarkup(
            h(
                Ch.DocsShell,
                { nav: [{ label: 'SDK', items: [{ href: '/sdk/me-client/README', label: 'me-client' }] }], current: '/sdk/me-client/README' },
                h(M.h1, null, 'me-client'),
                h(M.ul, null, ['SUDO_ACCOUNT_MISMATCH_MESSAGE', LONG_NAME].map((n) => h(M.li, { key: n }, h(M.a, { href: `variables/${n}` }, n)))),
                h(M.pre, null, h('code', { className: 'language-ts' }, `import type { ${LONG_NAME} } from '@orangecheck/me-client';\n`)),
                h(
                    M.table,
                    null,
                    h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'What'))),
                    h('tbody', null, h('tr', null, h('td', null, LONG_NAME), h('td', null, 'The body of a cancelled migration.')))
                )
            )
        )
    );
    // AppShell's phone bar as analytics composes it (the family menu, a theme toggle and the account beside the
    // home lockup), with the family's longest product word too, signed in and signed out: at 320 its menu button
    // was 22 wide signed in, and signed out 20 wide with the bar running 19px past the screen.
    const appBars = page(
        'app-bars',
        renderToStaticMarkup(
            h(
                'div',
                null,
                ...['analytics', longest].flatMap((product) =>
                    ['in', 'out'].map((state) =>
                        h(
                            'div',
                            { key: product + state, 'data-bar': product, 'data-state': state },
                            h(
                                Ch.AppShell,
                                {
                                    product,
                                    family: true,
                                    nav: [{ items: [{ href: '/a', label: 'Overview', active: true }] }],
                                    account: h('div', { className: 'flex items-center gap-1' }, h(Ch.ThemeToggle, {}), h(Ch.SessionAccountView, { state, name: 'Ada Lovelace', signInPath: '/signin' })),
                                },
                                h('p', null, 'page')
                            )
                        )
                    )
                )
            )
        )
    );
    // Targets a thumb missed: ProtocolNav's short names ("lock" 29 wide), the docs search button (40x40),
    // a folded code block's Show all (34 tall), and a code block whose long line scrolls, named for its region.
    const touchMore = page(
        'touch-more',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-6' },
                h(C.ProtocolNav, { current: 'lock' }),
                h('div', { 'data-t': 'search' }, h(C.SearchButton, null)),
                h(C.CodeBlock, { code: Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'), maxLines: 8, caption: 'Thirty lines' })
            )
        )
    );
    const codeRegion = page('code-region', '<div id="root"></div>', '<script src="coderegion.js"></script>');
    const dialogClose = page('dialog-close', '<div id="root"></div>', '<script src="dialogclose.js"></script>');
    const scrollNames = page('scroll-names', '<div id="root"></div>', '<script src="scrollnames.js"></script>');
    const portraitPage = page('portrait', '<div id="root"></div>', '<script src="portrait.js"></script>');
    const census = page('census', '<div id="root"></div>', '<script src="census.js"></script>');
    // A 2.0 page: header, hero, a verdict and a closing band. The hero and the closing sit on the
    // header's frame, and the H1 is the largest text that is read (the footer's wordmark is decoration).
    const framedPage = page(
        'framed-page',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }], cta: true }),
                h(C.PageHero, { eyebrow: 'Lumen Notes', title: 'Notes that know who wrote them.', lead: 'A lead.' }),
                h(C.VerifyReport, { verdict: 'valid', title: 'This note is signed', checks: [] }),
                h(C.Closing, { title: 'Ask for a backed account.', lead: 'A lead.' })
            )
        )
    );
    // One framed column (the prototype's main.wrap): the header, then a PageFrame holding the hero, a
    // section with its bar, heading and cards, and an ink band; the footer outside it.
    const oneFrame = page(
        'one-frame',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }], cta: true }),
                h(
                    C.PageFrame,
                    null,
                    h(C.PageHero, { eyebrow: 'Lumen Notes', title: 'Notes that know who wrote them.', lead: 'A lead.' }),
                    h(
                        C.Section,
                        { rule: true, 'data-s': 'cards' },
                        h(C.SectionBar, { start: 'How it works', end: '01 / 02', 'data-t': 'bar' }),
                        h('h2', { className: 'oca-display-3', 'data-t': 'h2' }, 'Every sign-up asks for a little more.'),
                        h('div', { className: 'grid gap-4 md:grid-cols-3' }, ...[1, 2, 3].map((i) => h(P.Card, { key: i, 'data-t': i === 1 ? 'card' : undefined }, `Card ${i}`)))
                    ),
                    h(C.Section, { tone: 'ink', rule: true, 'data-s': 'ink' }, h('h2', { className: 'oca-display-3', 'data-t': 'ink-h2' }, 'Real or a copy?'))
                ),
                h(Ch.SiteFooter, { legal: true, columns: [{ heading: 'Product', links: [{ href: '/how', label: 'How it works' }] }] })
            )
        )
    );
    // The frame's edge cases: a PageFrame inside a layout's PageFrame (a DocsShell page), a site's own
    // container inside an unframed Section, and a focusable control flush with a framed Section's foot.
    const frameEdges = page(
        'frame-edges',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }] }),
                h(
                    C.PageFrame,
                    { 'data-t': 'outer' },
                    h(
                        C.PageFrame,
                        { as: 'div', 'data-t': 'inner' },
                        h(C.Section, null, h('div', { className: 'oca-container' }, h('h2', { 'data-t': 'own-container' }, 'A site container in a Section'))),
                        h(C.Section, { framed: true, space: 'none' }, h('p', null, 'A flush control:'), h(P.Button, { 'data-t': 'flush' }, 'Continue'))
                    ),
                    h('div', { style: { height: '120px' } })
                )
            )
        )
    );
    // A SectionBar in every parent a site puts one in: a container's child, nested in a container, a
    // padded Frame, a Frame without padding, a bare section in the frame, and a Card. Each bar spans its
    // nearest edged box with its label on that box's axis; [data-box] marks the box, [data-axis] its axis.
    const bar = (k) => h(C.SectionBar, { start: `Bar ${k}`, end: '01 / 06', 'data-bar': k });
    const bars = page(
        'bars',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }] }),
                h(
                    C.PageFrame,
                    { 'data-box': 'frame' },
                    h(C.Section, { space: 'sm' }, bar('container')),
                    h(C.Section, { space: 'sm' }, h('div', { className: 'flex flex-col gap-4' }, h('div', null, bar('nested')))),
                    h(C.Section, { framed: true, space: 'sm' }, bar('padded')),
                    h(C.Frame, { padded: false }, bar('unpadded')),
                    h('section', null, bar('bare')),
                    h(C.Section, { space: 'sm' }, h(P.Card, { 'data-box': 'card' }, bar('card'), h('p', { 'data-axis': 'card' }, 'The card says one thing.')))
                )
            )
        )
    );
    // ochk.io/docs' shape: DocsShell with its sections and a page long enough to scroll past the sidebar.
    const docsFrame = page(
        'docs-frame',
        renderToStaticMarkup(
            h(
                Ch.DocsShell,
                {
                    nav: [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }, { href: '/docs/me/api', label: 'me API' }] }],
                    current: '/docs',
                    toc: [{ id: 'a', title: 'First', level: 2 }],
                },
                h('h1', { 'data-t': 'h1' }, 'Docs'),
                ...Array.from({ length: 12 }, (_, i) => h('p', { key: i }, 'A paragraph of the docs, long enough to fill a line or two of the page.'))
            )
        )
    );
    // A closed box: a hero with a glowing BrowserFrame, and in its art a shadow that runs 100px below
    // it, as a depiction's did (126px in chat's hero); the next section starts on its own ground.
    const closedBox = page(
        'closed-box',
        renderToStaticMarkup(
            h(
                C.PageFrame,
                null,
                h(C.PageHero, {
                    title: 'A depiction in the hero.',
                    lead: 'Its shadow stays in the hero.',
                    art: h(
                        'div',
                        { className: 'relative' },
                        h(C.BrowserFrame, { url: 'chat.ochk.io', glow: true }, h('div', { style: { height: '320px' } })),
                        // A shadow, as the depiction's was: drawn 40 to 100px below the art, across the hero's foot.
                        // A shadow is ink overflow, which overflow-x: clip leaves free on the y axis.
                        h('div', { 'data-probe': '', style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60px', boxShadow: '0 100px 0 0 rgb(255, 0, 0)' } })
                    ),
                }),
                // A bar straight after the hero, on the page's own ground, as chat's was: a section with a
                // ground of its own paints over what runs into it and would hide the fault.
                h('div', { 'data-s': 'next', className: 'oca-container py-16' }, h(C.SectionBar, { start: 'Next', end: '02' }))
            )
        )
    );
    // Every hero shape, its entrance read on the first frame.
    const heroes = page(
        'heroes',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h('div', { 'data-t': 'split' }, h(C.PageHero, { eyebrow: 'Lumen Notes', title: 'Notes that know who wrote them.', lead: 'A lead of one sentence.' })),
                h('div', { 'data-t': 's10' }, h(C.PageHero, { layout: 's10', eyebrow: 'Legal', title: 'Privacy policy', lead: 'What we keep, and for how long.' })),
                h('div', { 'data-t': 'document' }, h(C.PageHero, { variant: 'document', eyebrow: 'Legal', title: 'Terms', lead: 'The terms.' })),
                h('div', { 'data-t': 'error' }, h(C.ErrorPage, { code: 404, art: null })),
                h('div', { 'data-reveal': 'pending', 'data-t': 'reveal', style: { '--reveal-delay': '120ms' } }, 'Below the fold.')
            )
        )
    );
    // The same heroes with a CTA pair of different lengths (ochk.app's was 135 and 172px at 390): a Button,
    // and a link styled as one through asChild, as ochk.io's protocol pages pass them.
    const pair = () => [
        h(P.Button, { key: 'a', size: 'lg', 'data-cta': '' }, 'Get an account'),
        h(P.Button, { key: 'b', asChild: true, size: 'lg', variant: 'secondary', plus: true }, h('a', { href: '/how', 'data-cta': '' }, 'Read how it works first')),
    ];
    const heroActions = page(
        'hero-actions',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h('div', { 'data-t': 'split' }, h(C.PageHero, { title: 'Notes that know who wrote them.', lead: 'A lead.', actions: pair() })),
                h('div', { 'data-t': 's10' }, h(C.PageHero, { layout: 's10', title: 'Privacy policy', lead: 'A lead.', actions: pair() })),
                h('div', { 'data-t': 'document' }, h(C.PageHero, { variant: 'document', title: 'Terms', lead: 'A lead.', actions: pair() })),
                h('div', { 'data-t': 'error' }, h(C.ErrorPage, { code: 404, art: null, actions: pair() })),
                // The closing band holds the same pair by the same rule: one page, one CTA pair.
                h('div', { 'data-t': 'closing' }, h(C.Closing, { title: 'Ask for a backed account.', lead: 'A lead.', art: null, actions: pair() }))
            )
        )
    );
    // The footer's giant wordmark: one word at its natural spacing, filling the frame, nothing clipped.
    const wordmark = page(
        'wordmark',
        renderToStaticMarkup(h(Ch.SiteFooter, { columns: [{ heading: 'Product', links: [{ href: '/how', label: 'How it works' }] }], legal: true }))
    );
    const icons = page(
        'icons',
        renderToStaticMarkup(
            h(
                'div',
                // Apart, so each target is its own: two closer than 12px share the overlap.
                { className: 'flex items-center gap-4 p-6' },
                h(P.Button, { size: 'icon-sm', variant: 'ghost', 'aria-label': 'Generate another', 'data-t': 'icon-sm' }, 'G'),
                h(P.Button, { size: 'sm', 'data-t': 'sm' }, 'Get an account'),
                // Bordered: the target counts from the border box, not from inside it.
                h(P.Button, { size: 'sm', variant: 'secondary', 'data-t': 'sm-b' }, 'Add address'),
                // 2.0's trailing "+" leaves the target as it was.
                h(P.Button, { size: 'sm', variant: 'secondary', plus: true, 'data-t': 'sm-plus' }, 'Talk to us'),
                h(P.Button, { size: 'icon-sm', variant: 'secondary', 'aria-label': 'Refresh', 'data-t': 'icon-sm-b' }, 'R'),
                h(P.Button, { size: 'icon', variant: 'secondary', 'aria-label': 'Close', 'data-t': 'icon-b' }, 'X'),
                h(P.Button, { size: 'icon', variant: 'ghost', 'aria-label': 'Menu', 'data-t': 'icon' }, 'M'),
                h(C.CopyButton, { value: 'x', label: 'Copy passphrase' }),
                h(Ch.ThemeToggle, {}),
                h(C.Panel, { title: 'Hash rate', expandable: true }, h('p', null, 'chart'))
            )
        ) +
            renderToStaticMarkup(
                h(
                    'div',
                    // A HashChip's explorer link is a line of text: 44px to a thumb, its line unchanged.
                    { className: 'flex flex-col items-start gap-6 p-6' },
                    h('p', { 'data-t': 'hash' }, h(C.HashChip, { value: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t', explorer: 'address', copy: false })),
                    h('p', { 'data-t': 'hash-short' }, h(C.HashChip, { value: 'ab12', head: 2, tail: 2, explorer: 'tx', copy: false })),
                    // A link standing alone after a "·" is a 44px target to a thumb; the same link in a sentence is not.
                    h('p', { 'data-t': 'link-alone', className: 'text-[0.8125rem]' }, 'Created 2 days ago · ', h(C.TextLink, { href: 'https://ochk.io/u/x', standalone: true }, 'Your public record')),
                    h('p', { 'data-t': 'link-prose', className: 'text-[0.8125rem]' }, 'Created 2 days ago · ', h(C.TextLink, { href: 'https://ochk.io/u/x' }, 'Your public record')),
                    // An overlay over a scene, placed absolutely as globe places one: bordered, and still a 44px target.
                    h('div', { className: 'relative h-16 w-56 bg-oca-ink' }, h(P.Button, { size: 'sm', variant: 'overlay', className: 'absolute top-3 left-4', 'data-t': 'sm-o' }, 'Data'))
                )
            )
    );
    const LONG = 'pledge.query(address="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t", status="open", window_blocks=4320) — every open pledge from this address in the last month, newest first';
    const wrapRows = page(
        'wrap-rows',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'flex w-[20rem] flex-col gap-1 p-2' },
                h(C.ListRow, { variant: 'pane', onSelect: () => {}, lines: 'all', leading: h(C.Avatar, { seed: 'a', name: 'Query', size: 'md' }), title: 'Open pledges from one address', meta: '3', description: LONG, trailing: h('span', { 'data-end': '', style: { display: 'inline-block', width: 16, height: 16, background: 'currentColor' } }) }),
                h(C.ListRow, { variant: 'pane', onSelect: () => {}, title: 'Open pledges from one address', description: LONG, 'data-one': '' })
            )
        )
    );
    // ListRow's slots: a line over the title, two under it, a text action (ochk.app's Signed inbox, a binding to remove).
    const rowSlots = page(
        'row-slots',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, {
                    leading: h(C.Avatar, { seed: 'notes', name: 'Lumen Notes', size: 'md' }),
                    eyebrow: h('span', { 'data-s': 'eyebrow' }, 'Signed · 21 Oct'),
                    title: h('span', { 'data-s': 'title' }, 'Lumen Notes'),
                    meta: '2 min ago',
                    description: h('span', { 'data-s': 'desc' }, 'Asked to read your identity'),
                    detail: h('span', { 'data-s': 'detail' }, 'From notes.example, key 86020d78'),
                    onSelect: () => {},
                    action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-s': 'action' }, 'Retry this guardian'),
                }),
                // A smaller picture: the action still lines up with the text, not with a guess at the picture.
                h(C.ListRow, {
                    leading: h(C.Avatar, { seed: 'g2', name: 'Guardian two', size: 'sm' }),
                    title: h('span', { 'data-s': 'title2' }, 'Guardian 2 of 4'),
                    description: 'Did not answer the last round',
                    href: '/guardians/2',
                    action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-s': 'action2' }, 'Remove'),
                })
            )
        )
    );
    // A wide end (a badge and two buttons, about 210px), in trailing and in actions: on a phone it drops under the text.
    const wideEnd = (tag) => h('span', { 'data-s': tag, style: { display: 'inline-flex', width: 210, height: 32, background: 'var(--muted)' } });
    const rowWide = page(
        'row-wide',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, { leading: h(C.Avatar, { seed: 'x', name: 'xaxis', size: 'md' }), title: h('span', { 'data-s': 't-a' }, 'xaxis'), description: 'Holds 0.5 BTC unspent since block 814,210, the reason in full', trailing: wideEnd('end-a') }),
                h(C.ListRow, { leading: h(C.Avatar, { seed: 'y', name: 'proof', size: 'md' }), title: h('span', { 'data-s': 't-b' }, 'Proof 86020d78'), description: 'Signed by bc1q9h7g…5e3w7t', href: '/proofs/1', actions: wideEnd('end-b') })
            )
        )
    );
    // ListRow size="lg": ochk.app's home steps, as they looked before they were rows.
    const lgRows = page(
        'lg-rows',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto max-w-[44rem] p-4' },
                h(
                    C.ListCard,
                    null,
                    ...[
                        ['Sign in', '1 · Bitcoin address', 'A second way in is also your way back.', 'Add a second way in'],
                        ['Back it', 'Not yet', null, 'Back your account'],
                        ['Own it', 'orangecheck holds what you earn, for now', null, 'Who holds it'],
                    ].map(([eyebrow, title, note, act], i) =>
                        h(C.ListRow, {
                            key: i,
                            size: 'lg',
                            lines: 'all',
                            eyebrow: h('span', { 'data-lg': `e${i}` }, eyebrow),
                            title: h('span', { 'data-lg': `t${i}` }, title),
                            description: note ?? undefined,
                            action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-lg': `a${i}` }, act),
                        })
                    )
                )
            )
        )
    );
    // A list in a flush card: its rows run to the card's edges, lined up with the card's own text.
    const flushCards = page(
        'flush',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto flex max-w-[44rem] flex-col gap-6 p-4' },
                h(
                    P.Card,
                    { flush: true, className: 'flex flex-col gap-4', 'data-f': 'mid' },
                    h('h3', { 'data-f': 'head', className: 'oca-title-sm' }, 'System health'),
                    h(C.ListCard, null, ...['Relay', 'Executor', 'Mint'].map((t) => h(C.ListRow, { key: t, title: h('span', { 'data-f': 'row' }, t), description: 'Answering', trailing: h(P.Badge, null, 'up') }))),
                    h('p', { className: 'text-[0.8125rem]' }, 'Checked every minute.')
                ),
                h(P.Card, { flush: true, className: 'flex flex-col gap-4', 'data-f': 'end' }, h('h3', { className: 'oca-title-sm' }, 'Ledger'), h(C.ListCard, null, h(C.ListRow, { title: 'Settled', meta: '2 min ago' })))
            )
        )
    );
    // Docs headings that are one long identifier, and links a finger has to press: an SDK page at 390.
    const sdk = page(
        'sdk',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto max-w-[48rem] px-4 py-6', 'data-sdk': '' },
                h(C.Breadcrumbs, { items: [{ href: '/docs', label: 'Docs' }, { href: '/docs/sdk', label: 'SDKs' }, { label: 'agent-core' }] }),
                h(M.h1, { id: 'fn' }, 'Function: federationDescriptorCanonicalMessage()'),
                h(M.h2, { id: 'p' }, 'canonicalAbandonmentMessageBytes()'),
                h(M.h3, { id: 'r' }, 'resetFamilyRevocationCheckForTests'),
                h(M.p ?? 'p', null, 'Defined in: ', h(C.TextLink, { href: 'https://github.com/orangecheck/oc-packages/blob/main/agent-core/src/federation.ts#L42', 'data-link': 'prose' }, 'federation.ts:42')),
                h(M.ul ?? 'ul', null, h(M.li ?? 'li', null, h(C.TextLink, { href: '/sdk/agent-core/README', 'data-link': 'li' }, 'agent-core'))),
                // An ApiTable's 13px description text.
                h('p', { className: 'text-[0.8125rem]' }, 'See ', h(C.TextLink, { href: '/sdk/agent-core/interfaces/Delegation' }, 'Delegation')),
                mdTable(['Member', 'Type'], [[h(C.TextLink, { href: '/sdk/agent-core/functions/verify', 'data-link': 'cell' }, 'verify'), 'function']])
            )
        )
    );
    // A title that is one long token, a badge beside it: stackBelow="sm" gives a phone's title the whole row.
    const BC1Q = 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7tqzs2x9fhd5n6y8ue0cle';
    const badge = (k) => h('span', { 'data-st': k, style: { display: 'inline-flex', width: 110, height: 24, background: 'var(--muted)', borderRadius: 999 } });
    const stacked = page(
        'stacked',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, { lines: 'all', stackBelow: 'sm', title: h('span', { 'data-st': 'title' }, BC1Q), description: 'Eligible: 0.5 BTC held since block 814,210', trailing: badge('badge') }),
                h(C.ListRow, { lines: 'all', title: h('span', { 'data-st': 'title-plain' }, BC1Q), description: 'Eligible: 0.5 BTC held since block 814,210', trailing: badge('badge-plain') })
            )
        )
    );
    const borders = page(
        'borders',
        '<div class="p-4 text-foreground"><div data-b="bare" class="border p-2">a</div><div data-b="bottom" class="border-b p-2">b</div>' +
            '<div class="divide-y"><p class="p-2">c</p><p data-b="divide" class="p-2">d</p></div><div data-b="utility" class="border border-foreground p-2">e</div></div>'
    );
    const radii = page('radii', `<div class="flex gap-2 p-4">${RADII.map((c) => `<div data-r="${c}" class="${c} size-12 border">${c.slice(8) || 'r'}</div>`).join('')}</div>`);
    const menu = page('menu', '<div id="root" class="p-4"></div>', '<script src="menu.js"></script>');
    const toolMenu = page('toolmenu', '<div id="root"></div>', '<script src="toolmenu.js"></script>');
    const loadErr = page('loaderr', '<div id="root"></div>', '<script src="loaderr.js"></script>');
    // Rows in a pane, each with a picture, a time and a menu button.
    const paneRows = page(
        'pane-rows',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'flex w-[22rem] max-w-full flex-col gap-1 p-2' },
                // The third has no picture: a title alone must still be a thumb's height.
                ...['Ada Lovelace', 'Satoshi Fan Club with a long name', 'Notes'].map((name, i) =>
                    h(C.ListRow, {
                        key: name,
                        variant: 'pane',
                        onSelect: () => {},
                        current: i === 0,
                        leading: i < 2 ? h(C.Avatar, { seed: name, name, size: 'md' }) : undefined,
                        title: name,
                        meta: 'Yesterday',
                        actions: h('button', { type: 'button', 'data-act': '', className: 'size-11' }, '…'),
                    })
                )
            )
        )
    );

    // One column: a title in each kind of tool page.
    const title = h(C.PageHeader, { title: 'Verify a stamp', description: 'Drop a .stamp file.' });
    const shell = (props, child) => renderToStaticMarkup(h(Ch.ToolShell, { protocol: 'stamp', tools: [], ...props }, child));
    const columns = [
        ['wide', page('col-wide', shell({}, title))],
        ['narrow', page('col-narrow', shell({ measure: 'narrow' }, title))],
        ['app + ToolColumn', page('col-app', shell({ variant: 'app' }, h('div', { className: 'min-h-0 flex-1 overflow-y-auto' }, h(Ch.ToolColumn, null, title))))],
        ['ErrorPage', page('col-error', shell({}, h(C.ErrorPage, { code: 404 })))],
    ];
    // The small controls, on a phone.
    const targets = page(
        'targets',
        shell(
            {},
            h(
                'div',
                { className: 'flex flex-col gap-6' },
                h(C.FilterChips, { label: 'State', value: 'all', onChange: () => {}, options: [{ value: 'all', label: 'All' }, { value: 'kept', label: 'Kept', count: 3 }] }),
                h(C.ArtifactView, { content: '{"v":1,"kind":"stamp"}', title: 'Stamp envelope', filename: 'a.stamp' })
            )
        )
    );

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    // No text under 12px anywhere these pages draw, in the smallest places a site puts it (a 13px table
    // head, a 12px label): every visible element that holds text, as computed, at 390 and at 1440.
    // An inline code in a table head was 11.375px (0.875em of 13px).
    const small = new Map();
    const visit = async (p, url) => {
        visited.add(url);
        await p.goto(url);
        const found = await p.evaluate(() =>
            [...document.querySelectorAll('body *')]
                .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length > 0)
                .map((el) => [el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''), parseFloat(getComputedStyle(el).fontSize), el.textContent.trim().slice(0, 24)])
                .filter(([, size]) => size < 11.95)
        );
        for (const [el, size, text] of found) small.set(`${url.split('/').pop()}: ${el} ${size}px '${text}'`, true);
        for (const s of await stateEdges(p)) weak.set(`${url.split('/').pop()}: ${s}`, true);
    };
    // A state drawn as a fill (the current page, a chosen segment, a pressed chip, a highlighted item), as
    // rendered, however it was chosen (a class variant or a script's ternary): the fill reads 3:1 on the
    // ground under it, or an edge (a border, an outline, a ring) reads 3:1 on both the fill and that ground.
    const weak = new Map();
    const stateEdges = (p) =>
        p.evaluate(() => {
            const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
            const paint = (color, under) => {
                cv.globalCompositeOperation = 'copy';
                cv.fillStyle = under;
                cv.fillRect(0, 0, 1, 1);
                cv.globalCompositeOperation = 'source-over';
                cv.fillStyle = '#000';
                cv.fillStyle = color;
                cv.fillRect(0, 0, 1, 1);
                const [r, g, b] = cv.getImageData(0, 0, 1, 1).data;
                return `rgb(${r}, ${g}, ${b})`;
            };
            const alpha = (color) => {
                cv.globalCompositeOperation = 'copy';
                cv.fillStyle = 'rgba(0,0,0,0)';
                cv.fillStyle = color;
                cv.fillRect(0, 0, 1, 1);
                return cv.getImageData(0, 0, 1, 1).data[3];
            };
            const lum = (c) => {
                const [r, g, b] = c.match(/\d+/g).slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const ratio = (a, b) => {
                const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
                return (x + 0.05) / (y + 0.05);
            };
            const ground = (el) => {
                for (let e = el.parentElement; e; e = e.parentElement) {
                    const bg = getComputedStyle(e).backgroundColor;
                    if (alpha(bg) > 0) return paint(bg, ground(e) ?? '#fff');
                }
                return null;
            };
            const out = [];
            for (const el of document.querySelectorAll('[aria-current]:not([aria-current="false"]), [aria-selected="true"], [aria-pressed="true"], [data-state="active"]:not([role="tabpanel"]), [data-state="on"], [data-highlighted]')) {
                if (el.getClientRects().length === 0) continue;
                const cs = getComputedStyle(el);
                if (alpha(cs.backgroundColor) === 0) continue;
                const under = ground(el) ?? 'rgb(255, 255, 255)';
                const fill = paint(cs.backgroundColor, under);
                if (ratio(fill, under) >= 3) continue;
                const edges = [];
                for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
                    if (parseFloat(cs[`border${side}Width`]) >= 1 && cs[`border${side}Style`] !== 'none') edges.push(cs[`border${side}Color`]);
                }
                if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1) edges.push(cs.outlineColor);
                for (const m of cs.boxShadow.matchAll(/(rgba?\([^)]*\)|oklab\([^)]*\)|color\([^)]*\))\s+(?:inset\s+)?0px\s+0px\s+0px\s+([\d.]+)px/g)) if (parseFloat(m[2]) >= 1) edges.push(m[1]);
                const best = Math.max(0, ...edges.filter((e) => alpha(e) > 0).map((e) => Math.min(ratio(paint(e, fill), fill), ratio(paint(e, under), under))));
                if (best < 3) out.push(`${el.tagName.toLowerCase()} '${el.textContent.trim().slice(0, 16)}' fill ${ratio(fill, under).toFixed(2)}:1, edge ${best.toFixed(2)}:1`);
            }
            return out;
        });
    try {
        for (const [width, height] of [
            [390, 844],
            [1440, 900],
        ]) {
            // A phone is a touch screen: the 390 pass has a coarse pointer, as the targets it checks do.
            const p = await browser.newPage({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 });
            // Markdown tables: the one that fits does not scroll and no cell spills; the wide one scrolls.
            await visit(p, tables);
            const tb = await p.evaluate(() =>
                Object.fromEntries(
                    [...document.querySelectorAll('[data-t]')].map((w) => {
                        const scroller = w.querySelector('table').parentElement;
                        const spills = [...w.querySelectorAll('td, th')].filter((c) => c.scrollWidth > c.clientWidth + 1).length;
                        return [w.dataset.t, { scrolls: scroller.scrollWidth > scroller.clientWidth + 1, spills }];
                    })
                )
            );
            check(!tb.fits.scrolls && tb.fits.spills === 0, `[${width}] a three-column error table scrolls (${tb.fits.scrolls}) or spills from ${tb.fits.spills} cell(s)`);
            if (width < 768) check(tb.wide.scrolls, `[${width}] a table that cannot fit does not scroll`);
            // A tool site's phone menu holds Docs, a 44px target, beside About.
            if (width < 768) {
                await visit(p, toolMenu);
                await p.click('header button[aria-label="Open menu"]');
                await p.waitForSelector('[role="dialog"]');
                const docs = await p.evaluate(() => {
                    const a = [...document.querySelectorAll('[role="dialog"] a')].find((x) => x.textContent.trim().startsWith('Docs'));
                    return a ? { href: a.getAttribute('href'), h: a.getBoundingClientRect().height } : null;
                });
                check(docs?.href === 'https://ochk.io/docs/stamp' && docs.h >= 44, `[${width}] the tool site's phone menu has no 44px Docs link (${JSON.stringify(docs)})`);
            }
            // ListRow lines="all": wrapped in full, its picture and end level with the title.
            await visit(p, wrapRows);
            const wr = await p.evaluate(() => {
                const [all, one] = [...document.querySelectorAll('li')];
                const row = all.querySelector('button').getBoundingClientRect();
                const title = all.querySelector('button span.flex-col span span').getBoundingClientRect();
                const lineH = parseFloat(getComputedStyle(all.querySelector('button span.flex-col span span')).lineHeight) || 22.5;
                const end = all.querySelector('[data-end]').getBoundingClientRect();
                const pic = all.querySelector('[aria-hidden].rounded-full').getBoundingClientRect();
                const desc = all.querySelectorAll('button span.flex-col > span')[1];
                const oneDesc = one.querySelectorAll('button span.flex-col > span')[1];
                return {
                    h: row.height,
                    endOff: end.top + end.height / 2 - (title.top + lineH / 2),
                    picOff: pic.top - title.top,
                    wraps: desc.getBoundingClientRect().height > 40 && desc.scrollWidth <= desc.clientWidth + 1,
                    oneCut: oneDesc.scrollWidth > oneDesc.clientWidth + 1 && oneDesc.getBoundingClientRect().height < 30,
                };
            });
            check(wr.h >= 44 && wr.wraps, `[${width}] ListRow lines="all": ${Math.round(wr.h)}px tall, the line wraps in full ${wr.wraps}`);
            check(Math.abs(wr.endOff) <= 3 && wr.picOff <= 6 && wr.picOff >= -12, `[${width}] ListRow lines="all": the end is ${wr.endOff.toFixed(1)}px off the title's line, the picture ${wr.picOff.toFixed(1)}px`);
            check(wr.oneCut, `[${width}] ListRow: the default no longer cuts the line to one`);
            // 1.9.0 parts.
            await visit(p, parts190);
            const b190 = await p.evaluate((phone) => {
                const lands = (el, x, y) => el.contains(document.elementFromPoint(x, y));
                const out = {};
                if (phone) {
                    const li = [...document.querySelectorAll('ul > li')].find((x) => x.querySelector('a[href="/people/a1"]'));
                    if (!li) return { rowOpens: false, copyOwn: false, line: 99, chipTarget: false, tabsIn: false, over: 0 };
                    li.scrollIntoView({ block: 'center' });
                    const r = li.getBoundingClientRect();
                    out.rowOpens = lands(li.querySelector('a'), r.left + r.width - 20, r.bottom - 8);
                    const copy = li.querySelector('[data-copy]').getBoundingClientRect();
                    out.copyOwn = lands(li.querySelector('[data-copy]'), copy.left + copy.width / 2, copy.top + copy.height / 2);
                } else {
                    const tr = document.querySelector('tbody tr');
                    const when = tr.cells[2].getBoundingClientRect();
                    const link = tr.querySelector('a');
                    out.rowOpens = Boolean(link) && lands(link, when.left + when.width / 2, when.top + when.height / 2);
                    const copy = tr.querySelector('[data-copy]').getBoundingClientRect();
                    out.copyOwn = lands(tr.querySelector('[data-copy]'), copy.left + copy.width / 2, copy.top + copy.height / 2);
                }
                const line = document.querySelector('[data-line]');
                const btn = line.querySelector('button');
                line.scrollIntoView({ block: 'center' });
                const b = btn.getBoundingClientRect();
                out.line = line.getBoundingClientRect().height;
                out.chipTarget = lands(btn, b.left + b.width / 2, b.top + b.height / 2 - 21.5) && lands(btn, b.left + b.width / 2, b.top + b.height / 2 + 21.5);
                const list = document.querySelector('[data-wrap]');
                const tabs = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
                out.tabsIn = tabs.every((t) => t.right <= document.documentElement.clientWidth && t.left >= 0);
                out.over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
                return out;
            }, width < 640);
            check(b190.rowOpens, `[${width}] DataTable: a press elsewhere in a linked row does not open it`);
            check(b190.copyOwn, `[${width}] DataTable: a control in a linked row lost its press to the row`);
            check(b190.line < 32 && b190.chipTarget, `[${width}] HashChip compact: the line is ${Math.round(b190.line)}px, or its copy is not a 44px target`);
            check(b190.tabsIn && b190.over <= 0, `[${width}] TabsList wrap: a tab sits off the screen (overflow ${b190.over})`);
            if (width >= 1024) {
                await visit(p, productShell);
                const side = await p.evaluate(() => {
                    const aside = document.querySelector('aside');
                    const home = aside.querySelector('a[href="/"]');
                    return { asideRight: aside.getBoundingClientRect().right, homeRight: home.getBoundingClientRect().right, scroll: aside.scrollWidth - aside.clientWidth };
                });
                check(side.homeRight <= side.asideRight && side.scroll <= 0, `[${width}] AppShell: the lockup and product word overflow the sidebar (${Math.round(side.homeRight)} > ${Math.round(side.asideRight)})`);
                await visit(p, deskShell);
                const desk = await p.evaluate(async () => {
                    const box = (el) => el.getBoundingClientRect();
                    const aside = document.querySelector('aside');
                    // The phone bar holds the account too, hidden here: the one drawn.
                    const bar = [...document.querySelectorAll('[data-account]')].find((el) => el.getClientRects().length > 0).closest('header');
                    const main = document.querySelector('main');
                    const banner = document.querySelector('[data-banner]');
                    const out = { aside: box(aside).toJSON(), bar: box(bar).toJSON(), main: box(main).toJSON(), banner: box(banner).toJSON(), barFirst: !!(bar.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING) };
                    scrollTo(0, 1200);
                    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                    out.asideTopScrolled = box(aside).top;
                    scrollTo(0, 0);
                    return out;
                });
                check(
                    desk.barFirst &&
                        desk.aside.left < 1 &&
                        Math.abs(desk.aside.top) < 1 &&
                        Math.abs(desk.aside.height - height) < 1 &&
                        desk.bar.left >= desk.aside.right - 0.5 &&
                        Math.abs(desk.bar.top) < 1 &&
                        Math.abs(desk.bar.height - 72) < 1 &&
                        desk.banner.top >= desk.bar.bottom - 0.5 &&
                        desk.main.top >= desk.banner.bottom - 0.5 &&
                        desk.main.left >= desk.aside.right - 0.5 &&
                        Math.abs(desk.asideTopScrolled) < 1,
                    `[${width}] AppShell: the account bar is first in the page ${desk.barFirst} but drawn at ${JSON.stringify(desk.bar)}, the sidebar at ${JSON.stringify(desk.aside)} (scrolled top ${desk.asideTopScrolled}), main at ${JSON.stringify(desk.main)}`
                );
            }
            // The family footer: a phone gets folded groups in 600px; a desk the columns.
            await visit(p, footer);
            const ft = await p.evaluate(() => {
                const f = document.querySelector('footer');
                const groups = [...f.querySelectorAll('details')];
                const shown = (el) => el.getClientRects().length > 0;
                const deskLinks = [...f.querySelectorAll('details ~ div a, div.col-span-full ~ div.hidden a')].map((a) => a.getAttribute('href'));
                return {
                    h: f.getBoundingClientRect().height,
                    groups: groups.length,
                    groupsShown: groups.filter(shown).length,
                    closed: groups.every((g) => !g.open),
                    summaries: groups.filter(shown).map((g) => g.querySelector('summary').getBoundingClientRect().height),
                    phoneLinks: groups.flatMap((g) => [...g.querySelectorAll('a')].map((a) => a.getAttribute('href'))),
                    deskShown: [...f.querySelectorAll('a')].filter((a) => shown(a) && !a.closest('details') && !a.closest('[aria-label="Legal"]')).length,
                    deskLinks,
                };
            });
            if (width < 768) {
                const inter = await p.evaluate(async () => {
                    await document.fonts.ready;
                    return [...document.fonts].filter((f) => /OCA Inter/.test(f.family)).map((f) => f.status);
                });
                check(inter.includes('loaded'), `[${width}] the page measured without Inter loaded (${inter.join()})`);
                check(ft.h <= 600, `[${width}] the family footer runs ${Math.round(ft.h)}px, past 600`);
                check(ft.groupsShown > 0 && ft.closed && ft.summaries.every((x) => x >= 44), `[${width}] footer groups: ${ft.groupsShown} shown, closed ${ft.closed}, summaries ${ft.summaries.map(Math.round).join('/')}px`);
                if (ft.groupsShown > 0) await p.click('footer details summary');
                const opened = await p.evaluate(() => [...(document.querySelector('footer details')?.querySelectorAll('a') ?? [])].filter((a) => a.getClientRects().length > 0 && a.getBoundingClientRect().height >= 43.5).length);
                check(opened > 0, `[${width}] an opened footer group shows no 44px link`);
            } else {
                check(ft.groupsShown === 0 && ft.deskShown >= ft.phoneLinks.length, `[${width}] a desk sees ${ft.groupsShown} folded groups and ${ft.deskShown} of ${ft.phoneLinks.length} links`);
            }
            // ListRow slots: the line over the title, two under it, a text action beside them or, on a phone, under them.
            await visit(p, rowSlots);
            const rs = await p.evaluate(() => {
                const box = (s) => document.querySelector(`[data-s="${s}"]`)?.getBoundingClientRect() ?? null;
                const [eyebrow, title, desc, detail, action] = ['eyebrow', 'title', 'desc', 'detail', 'action'].map(box);
                const li = document.querySelector('li').getBoundingClientRect();
                const hits = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                return {
                    shown: [eyebrow, title, desc, detail, action].every(Boolean),
                    order: eyebrow && title && desc && detail ? eyebrow.bottom <= title.top + 1 && title.bottom <= desc.top + 1 && desc.bottom <= detail.top + 1 : false,
                    clear: action ? ![eyebrow, title, desc, detail].some((t) => hits(t, action)) : false,
                    under: action && detail ? action.top >= detail.bottom : false,
                    indent: action && title ? Math.round(action.left - title.left) : null,
                    inside: action ? action.right <= li.right + 0.5 && action.left >= li.left : false,
                    indent2: Math.round(box('action2').left - box('title2').left),
                    // The row still opens from its line under the title, and the action stays its own.
                    opens: (() => {
                        const row2 = document.querySelectorAll('li')[1];
                        const link = row2.querySelector('a[href="/guardians/2"]');
                        const line = [...row2.querySelectorAll('span')].find((x) => x.textContent === 'Did not answer the last round').getBoundingClientRect();
                        const a2 = box('action2');
                        return Boolean(link) && link.contains(document.elementFromPoint(line.left + 10, line.top + line.height / 2)) && document.querySelector('[data-s="action2"]').contains(document.elementFromPoint(a2.left + a2.width / 2, a2.top + a2.height / 2));
                    })(),
                };
            });
            check(rs.shown && rs.order, `[${width}] ListRow: the line over the title, the title and the two lines under it are missing or out of order (${JSON.stringify(rs)})`);
            check(rs.clear && rs.inside, `[${width}] ListRow action: the text action covers the row's text or leaves the row (${JSON.stringify(rs)})`);
            check(rs.opens, `[${width}] ListRow action: the row no longer opens from its text, or the action lost its press (${JSON.stringify(rs)})`);
            if (width < 640) check(rs.under && Math.abs(rs.indent) <= 1 && Math.abs(rs.indent2) <= 1, `[${width}] ListRow action: on a phone it is not under the text, lined up with it (${JSON.stringify(rs)})`);
            else check(!rs.under, `[${width}] ListRow action: on a desk it falls under the text (${JSON.stringify(rs)})`);
            // A wide end beside the text on a desk; on a phone under it, lined up with it, the text kept whole.
            await visit(p, rowWide);
            const rw = await p.evaluate(() =>
                ['a', 'b'].map((k) => {
                    const t = document.querySelector(`[data-s="t-${k}"]`);
                    const text = t.closest('.flex-col').getBoundingClientRect();
                    const end = document.querySelector(`[data-s="end-${k}"]`).getBoundingClientRect();
                    const hit = end.left < text.right && text.left < end.right && end.top < text.bottom && text.top < end.bottom;
                    return { k, textW: Math.round(text.width), under: end.top >= text.bottom - 1, aligned: Math.abs(end.left - text.left) <= 1, hit };
                })
            );
            for (const r of rw) {
                check(!r.hit, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end covers the text (${JSON.stringify(r)})`);
                if (width < 640) check(r.under && r.aligned && r.textW >= 144, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end squeezes the text to ${r.textW}px rather than dropping under it (${JSON.stringify(r)})`);
                else check(!r.under, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end left the text's side on a desk (${JSON.stringify(r)})`);
            }
            // ListRow lg: the value at 1.125rem, the before's air, hairlines inset to the text.
            await visit(p, lgRows);
            const lgm = await p.evaluate(() => {
                const ulEl = document.querySelector('ul');
                // From the list's inner edge, past its 1px border.
                const ul = { left: ulEl.getBoundingClientRect().left + ulEl.clientLeft, top: ulEl.getBoundingClientRect().top + ulEl.clientTop };
                const lis = [...document.querySelectorAll('ul > li')];
                const r = (s) => document.querySelector(`[data-lg="${s}"]`).getBoundingClientRect();
                const title = document.querySelector('[data-lg="t0"]').parentElement;
                return {
                    size: parseFloat(getComputedStyle(title).fontSize),
                    weight: getComputedStyle(title).fontWeight,
                    inset: Math.round(lis[1].getBoundingClientRect().left - ul.left),
                    line: getComputedStyle(lis[0]).borderBottomWidth,
                    textAt: Math.round(r('e1').left - lis[1].getBoundingClientRect().left),
                    top: Math.round(document.querySelector('[data-lg="e0"]').parentElement.getBoundingClientRect().top - ul.top),
                    aUnder: r('a0').top >= r('t0').bottom,
                    gap: Math.round(r('a0').top - document.querySelector('[data-lg="t0"]').closest('.flex-col').getBoundingClientRect().bottom),
                    centred: Math.abs((r('a1').top + r('a1').bottom) / 2 - (r('e1').top + r('t1').bottom) / 2),
                };
            });
            const pad = width < 768 ? 24 : 32;
            check(lgm.size === 18 && lgm.weight === '400', `[${width}] ListRow lg: the title is ${lgm.size}px at ${lgm.weight}, not 18px regular`);
            check(lgm.inset === pad && lgm.line === '1px' && lgm.textAt === 0 && Math.abs(lgm.top - pad) <= 1, `[${width}] ListRow lg: hairlines inset ${lgm.inset}px (want ${pad}), text ${lgm.textAt}px from them, first row ${lgm.top}px down`);
            if (width < 640) check(lgm.aUnder && lgm.gap >= 16, `[${width}] ListRow lg: the action is not under the text with room (${JSON.stringify(lgm)})`);
            else check(!lgm.aUnder && lgm.centred <= 2, `[${width}] ListRow lg: the action is not beside the text, centred on it (${JSON.stringify(lgm)})`);
            // Card flush: the list spans the card, its rows lined up with the card's text; last, it takes the card's foot.
            await visit(p, flushCards);
            const fl = await p.evaluate(() => {
                const card = (k) => document.querySelector(`[data-f="${k}"]`);
                const mid = card('mid').getBoundingClientRect();
                const list = card('mid').querySelector('ul');
                const lr = list.getBoundingClientRect();
                const head = card('head').getBoundingClientRect();
                const row = card('mid').querySelector('[data-f="row"]').getBoundingClientRect();
                const end = card('end').getBoundingClientRect();
                const endList = card('end').querySelector('ul').getBoundingClientRect();
                return {
                    edges: [Math.round(lr.left - mid.left), Math.round(mid.right - lr.right)],
                    sides: getComputedStyle(list).borderLeftWidth,
                    rowAt: Math.round(row.left - head.left),
                    foot: Math.round(end.bottom - endList.bottom),
                };
            });
            check(fl.edges[0] === 1 && fl.edges[1] === 1 && fl.sides === '0px', `[${width}] Card flush: the list sits ${fl.edges.join('/')}px inside the card's edges with ${fl.sides} side borders, a card in a card`);
            check(fl.rowAt === 0 && fl.foot === 1, `[${width}] Card flush: rows start ${fl.rowAt}px off the card's text, and a last list stops ${fl.foot}px above its foot`);
            // Long identifiers in headings break; links are 24px to a finger in prose, a list and a table cell.
            await visit(p, sdk);
            const sd = await p.evaluate(() => ({
                over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                wide: [...document.querySelectorAll('[data-sdk] h1, [data-sdk] h2, [data-sdk] h3')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.tagName + ' ' + x.scrollWidth + '/' + x.clientWidth),
                links: Object.fromEntries([...document.querySelectorAll('[data-sdk] a[href]:not([href^="#"])')].map((a, i) => [a.textContent + i, Math.round(a.getBoundingClientRect().height)])),
            }));
            check(sd.over <= 0 && sd.wide.length === 0, `[${width}] docs headings: a long identifier widens the page by ${sd.over}px (${sd.wide.join(', ')})`);
            check(Object.values(sd.links).length >= 3 && Object.values(sd.links).every((x) => x >= 24), `[${width}] TextLink: a link is shorter than 24px to press (${JSON.stringify(sd.links)})`);
            // A heading's "#" anchor and the breadcrumbs: 24px to press too, the anchor's line unchanged.
            const tg = await p.evaluate(() => {
                const anchors = [...document.querySelectorAll('[data-sdk] h2 a[href^="#"], [data-sdk] h3 a[href^="#"]')].map((a) => {
                    a.scrollIntoView({ block: 'center' });
                    const r = a.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const lands = (y) => a.contains(document.elementFromPoint(cx, y));
                    return lands(cy - 11.5) && lands(cy + 11.5);
                });
                const crumbs = [...document.querySelectorAll('[data-sdk] nav[aria-label="Breadcrumb"] a')].map((a) => Math.round(a.getBoundingClientRect().height));
                return { anchors, crumbs };
            });
            check(tg.anchors.length >= 2 && tg.anchors.every(Boolean), `[${width}] a docs heading's "#" anchor is not 24px to press (${JSON.stringify(tg.anchors)})`);
            check(tg.crumbs.length === 2 && tg.crumbs.every((x) => x >= 24), `[${width}] Breadcrumbs: a link is ${JSON.stringify(tg.crumbs)}px tall, under 24`);
            // The fallback faces set text at Inter's widths, so the swap does not move a line: docs prose
            // reflowed at 17px (CLS 0.1), and a code token ran a third wider. Each stack against itself without Inter.
            if (width >= 1024) {
                const fb = await p.evaluate(async ([prose, headline, code]) => {
                    const root = getComputedStyle(document.documentElement);
                    const stack = (name) => root.getPropertyValue(name).trim();
                    const probe = (font, family, text) => {
                        const s = document.createElement('span');
                        s.style.cssText = `font: ${font} ${family}; line-height: normal; white-space: nowrap; position: absolute`;
                        s.textContent = text;
                        document.body.append(s);
                        const r = s.getBoundingClientRect();
                        s.remove();
                        return { w: r.width, h: r.height };
                    };
                    const cases = [
                        ...['400 15px', '400 16px', '400 17px', '500 16px', '600 16px', '700 16px'].map((font) => [font, '--oc-font-sans', prose, 0.01]),
                        // Display type is set at 300 (oca-display-*) as well as 400: Inter Light is narrower.
                        ...['300 36px', '300 60px', '400 32px', '400 48px', '400 76px'].map((font) => [font, '--oc-font-display', headline, 0.01]),
                        ['400 14px', '--oc-font-mono', code, 0.005],
                    ].map(([font, name, text, tol]) => {
                        const full = stack(name);
                        return { font, name, text, tol, full, without: full.slice(full.indexOf(',') + 1).trim() };
                    });
                    // allSettled: a fallback face whose local() font this machine lacks (Noto, DejaVu or
                    // Ubuntu on a CI runner) rejects its load, which is the browser skipping it, not a fault.
                    await Promise.allSettled(cases.flatMap((c) => [document.fonts.load(`${c.font} ${c.full}`, c.text), document.fonts.load(`${c.font} ${c.without}`, c.text)]));
                    const mono = probe('400 16px', 'monospace', prose).w;
                    // Does this machine have Arial or one of its metric twins at all?
                    const twin = ['Arial', "'Liberation Sans'", 'Arimo'].some((f) => Math.abs(probe('400 16px', `${f}, monospace`, prose).w - mono) >= 0.5);
                    return {
                        twin,
                        cases: cases.map((c) => {
                            const a = probe(c.font, c.full, c.text);
                            const b = probe(c.font, c.without, c.text);
                            return { font: c.font, name: c.name, tol: c.tol, off: b.w / a.w - 1, dh: b.h - a.h, fallback: c.without.split(',')[0] };
                        }),
                    };
                }, [FALLBACK_PROSE, FALLBACK_HEADLINE, FALLBACK_CODE]);
                if (!fb.twin) console.log(`  · layout: no Arial or metric twin on this machine; the fallback faces' widths are not measured here`);
                else
                    for (const c of fb.cases)
                        check(
                            Math.abs(c.off) <= c.tol && Math.abs(c.dh) <= 1,
                            `[${width}] ${c.name} at ${c.font}: ${c.fallback} sets text ${(c.off * 100).toFixed(2)}% off the webfont's width (within ${c.tol * 100}%), its line ${c.dh.toFixed(1)}px off: the swap moves the line`
                        );
            }
            // SignInFrame holds still while its ceremony mounts: the title stays put and the ink column's art does not re-centre.
            await visit(p, signinGrow);
            const place = () =>
                p.evaluate(() => {
                    const aside = document.querySelector('main > aside');
                    const art = aside?.firstElementChild?.getBoundingClientRect();
                    return { title: document.querySelector('#signin h1').getBoundingClientRect().top, art: art && art.height ? art.top + art.height / 2 : null, aside: aside?.getBoundingClientRect().height ?? 0 };
                });
            const before = await place();
            await p.evaluate(() => (document.querySelector('[data-ceremony]').style.height = '1400px'));
            const after = await place();
            check(Math.abs(after.title - before.title) < 1, `[${width}] SignInFrame: the title moved ${Math.round(after.title - before.title)}px as the ceremony grew`);
            if (width >= 1024)
                check(
                    before.art !== null && Math.abs(after.art - before.art) < 1 && after.aside <= height + 0.5,
                    `[${width}] SignInFrame: the art moved ${Math.round((after.art ?? 0) - (before.art ?? 0))}px and the ink column is ${Math.round(after.aside)}px tall in a ${height}px window`
                );
            // stackBelow="sm": on a phone a long-token title takes the row and the badge goes under it; from sm, as without it.
            await visit(p, stacked);
            const st = await p.evaluate(() => {
                const r = (k) => document.querySelector(`[data-st="${k}"]`).getBoundingClientRect();
                const title = document.querySelector('[data-st="title"]');
                const lh = parseFloat(getComputedStyle(title.parentElement).lineHeight) || 22.5;
                const col = title.closest('.flex-col').getBoundingClientRect();
                const row = title.closest('li').getBoundingClientRect();
                return {
                    lines: Math.round(r('title').height / lh),
                    colW: Math.round(col.width),
                    rowW: Math.round(row.width - 40),
                    under: r('badge').top >= r('title').bottom,
                    aligned: Math.abs(r('badge').left - col.left) <= 1,
                    same: Math.abs(r('title').width - r('title-plain').width) <= 1 && Math.abs(r('badge').top - r('title').top - (r('badge-plain').top - r('title-plain').top)) <= 1,
                };
            });
            if (width < 640) check(st.lines <= 2 && st.colW >= st.rowW - 1 && st.under && st.aligned, `[${width}] ListRow stackBelow="sm": the long title keeps ${st.colW}px of ${st.rowW} and wraps to ${st.lines} lines, the badge ${st.under ? 'under' : 'beside'} it`);
            else check(st.same && !st.under, `[${width}] ListRow stackBelow="sm": a desk's row changed (${JSON.stringify(st)})`);
            // A product's footer with seven groups still fits a phone, every link kept.
            await visit(p, productFooter);
            const pf = await p.evaluate(async () => {
                await document.fonts.ready;
                const f = document.querySelector('footer');
                return {
                    h: f.getBoundingClientRect().height,
                    groups: f.querySelectorAll('details').length,
                    links: f.querySelectorAll('details a').length,
                    deskLinks: f.querySelectorAll('[class~="md:flex"] a').length,
                    summaries: [...f.querySelectorAll('details summary')].filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect().height),
                    legal: [...f.querySelectorAll('[aria-label="Legal"] a')].map((a) => a.getBoundingClientRect().height),
                };
            });
            if (width < 768) {
                check(pf.groups === 7 && pf.h <= 600, `[${width}] a product footer with ${pf.groups} groups runs ${Math.round(pf.h)}px, past 600`);
                check(pf.links > 9 && pf.links === pf.deskLinks && pf.summaries.every((x) => x >= 44) && pf.legal.every((x) => x >= 44), `[${width}] the product footer lost a link (${pf.links}) or a 44px target`);
            }
            // SectionTitle: one button beside its title; three wrap under it, inside the column.
            if (width < 640) {
                await visit(p, titles);
                const st = await p.evaluate(() =>
                    Object.fromEntries(
                        [...document.querySelectorAll('[data-t]')].map((el) => {
                            const heading = el.querySelector('h2').getBoundingClientRect();
                            const action = el.firstElementChild.lastElementChild.getBoundingClientRect();
                            return [el.dataset.t, { beside: action.top < heading.bottom && action.left > heading.left, top: Math.round(action.top - heading.top), under: action.top >= heading.bottom, right: action.right <= document.documentElement.clientWidth - 16 + 0.5 }];
                        })
                    )
                );
                check(st.one.beside && Math.abs(st.one.top) <= 6, `[${width}] SectionTitle: one button left its title's row (${JSON.stringify(st.one)})`);
                check(st.many.under && st.many.right, `[${width}] SectionTitle: three buttons crowd the title or run off the column (${JSON.stringify(st.many)})`);
            }
            // Every link a desk shows, a phone reaches through its groups.
            check(ft.groups > 0 && ft.phoneLinks.length > 0 && ft.phoneLinks.join() === ft.deskLinks.join(), `[${width}] the phone's groups hold ${ft.phoneLinks.length} links, the desk's columns ${ft.deskLinks.length}`);
            // 32px icon buttons: 44px to a thumb, unchanged to a mouse.
            {
                const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768 });
                const t = await ctx.newPage();
                await visit(t, icons);
                const reach = await t.evaluate(() =>
                    ['[data-t="icon-sm"]', '[data-t="sm"]', '[data-t="icon"]', '[data-t="sm-b"]', '[data-t="sm-plus"]', '[data-t="sm-o"]', '[data-t="icon-sm-b"]', '[data-t="icon-b"]', 'button[aria-label="Copy passphrase"]', 'button[aria-label="Open full screen"]', 'button[aria-label^="Theme:"]'].map((sel) => {
                        const el = document.querySelector(sel);
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        // A wide button needs only the height; a square one both ways.
                        const wide = r.width > 44;
                        return { sel, size: Math.round(r.height), w: Math.round(r.width), reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) && (wide || (lands(cx - 21.5, cy) && lands(cx + 21.5, cy))) };
                    })
                );
                const DRAWN = { '[data-t="sm"]': 36, '[data-t="sm-b"]': 36, '[data-t="sm-plus"]': 36, '[data-t="sm-o"]': 36, '[data-t="icon"]': 40, '[data-t="icon-b"]': 40, 'button[aria-label^="Theme:"]': 44 };
                for (const r of reach) {
                    const drawn = DRAWN[r.sel] ?? 32;
                    if (width < 768) check(r.reach && r.size === drawn, `[${width} touch] ${r.sel}: drawn ${r.w}×${r.size}px, 44px target ${r.reach}`);
                    // A control drawn at 44px reaches 44px on its own; the rest grow only to a thumb.
                    else check((drawn >= 44 || !r.reach) && r.size === drawn, `[${width} mouse] ${r.sel}: drawn ${r.size}px, or the target grew past the button (${r.reach})`);
                }
                // A HashChip link keeps its line's height; a thumb gets 44px, at least 44px wide when the value is short.
                const links = await t.evaluate(() =>
                    ['hash', 'hash-short'].map((k) => {
                        const line = document.querySelector(`[data-t="${k}"]`);
                        const el = line.querySelector('a');
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        const across = r.width >= 44 || (lands(cx - 21.5, cy) && lands(cx + 21.5, cy));
                        return { k, h: r.height, w: Math.round(r.width), line: line.getBoundingClientRect().height, reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) && across };
                    })
                );
                for (const l of links) {
                    const drawn = l.h < 30 && Math.abs(l.line - l.h) < 6;
                    if (width < 768) check(l.reach && drawn, `[${width} touch] HashChip ${l.k}: link ${l.w}×${Math.round(l.h)}px in a ${Math.round(l.line)}px line, 44px target ${l.reach}`);
                    else check(!l.reach && drawn, `[${width} mouse] HashChip ${l.k}: link ${Math.round(l.h)}px, or its target grew past the text (${l.reach})`);
                }
                // TextLink standalone: the same reach test; its line is as tall as the sentence link's.
                const text = await t.evaluate(() =>
                    ['link-alone', 'link-prose'].map((k) => {
                        const line = document.querySelector(`[data-t="${k}"]`);
                        const el = line.querySelector('a');
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        return { k, w: Math.round(r.width), h: Math.round(r.height), line: line.getBoundingClientRect().height, reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) };
                    })
                );
                const [alone, prose] = text;
                check(alone.line === prose.line, `[${width}] TextLink standalone: its line is ${alone.line}px, the sentence link's ${prose.line}px`);
                check(!prose.reach, `[${width}] TextLink in a sentence: its target grew to 44px`);
                if (width < 768) check(alone.reach, `[${width} touch] TextLink standalone: link ${alone.w}×${alone.h}px, 44px target ${alone.reach}`);
                else check(!alone.reach, `[${width} mouse] TextLink standalone: its target grew past the text`);
                // A field has no box beyond its own: a small one is drawn 44px tall to a thumb, 36px to a mouse.
                await visit(t, fields);
                const fh = await t.$$eval('[data-f]', (els) => Object.fromEntries(els.map((el) => [el.dataset.f, el.getBoundingClientRect().height])));
                for (const [k, hgt] of Object.entries(fh)) {
                    const want = width < 768 || k === 'md' ? 44 : 36;
                    check(Math.abs(hgt - want) < 0.5, `[${width} ${width < 768 ? 'touch' : 'mouse'}] a ${k} field is ${Math.round(hgt)}px tall, not ${want}`);
                }
                check(Object.keys(fh).length === 4, `[${width}] the fields page drew ${Object.keys(fh).join(', ')}`);
                await ctx.close();
            }
            // Bare borders take the hairline token, in both modes; a colour utility still wins.
            for (const dark of [false, true]) {
                await visit(p, borders);
                const seen = await p.evaluate((dark) => {
                    document.documentElement.classList.toggle('dark', dark);
                    const probe = document.createElement('i');
                    probe.style.color = 'var(--border)';
                    document.body.append(probe);
                    const token = getComputedStyle(probe).color;
                    const fg = getComputedStyle(document.body).color;
                    const side = { bare: 'borderTopColor', bottom: 'borderBottomColor', divide: 'borderTopColor', utility: 'borderTopColor' };
                    return { token, fg, ...Object.fromEntries(Object.entries(side).map(([k, s]) => [k, getComputedStyle(document.querySelector(`[data-b="${k}"]`))[s]])) };
                }, dark);
                const mode = dark ? 'dark' : 'light';
                for (const k of ['bare', 'bottom', 'divide']) check(seen[k] === seen.token, `[${width} ${mode}] a bare ${k === 'bare' ? 'border' : k === 'bottom' ? 'border-b' : 'divide-y'} is ${seen[k]}, not the hairline ${seen.token}`);
                check(seen.utility === seen.fg, `[${width} ${mode}] border-foreground lost to the base rule (${seen.utility})`);
            }
            // A site's own rounded-xs to rounded-4xl draw square under the theme: 2.0's radius is 0, and every step
            // follows it, xs too (Tailwind's own xs is 2px).
            await visit(p, radii);
            const corners = await p.$$eval('[data-r]', (els) => els.map((el) => [el.dataset.r, getComputedStyle(el).borderTopLeftRadius]));
            check(corners.length === RADII.length && corners.every(([, r]) => r === '0px'), `[${width}] a site's own rounded steps are not square: ${corners.filter(([, r]) => r !== '0px').map(([c, r]) => `${c} ${r}`).join(', ') || `${corners.length} of ${RADII.length} drawn`}`);
            // Panel header: the actions on the first row, at the right, beside two lines of description.
            await visit(p, header);
            const rows = await p.$$eval('section', (secs) =>
                secs.map((s) => {
                    const title = s.querySelector('h3').getBoundingClientRect();
                    const desc = s.querySelector('header p').getBoundingClientRect();
                    const btn = s.querySelector('button[aria-label="Open full screen"]').getBoundingClientRect();
                    const head = s.querySelector('header').getBoundingClientRect();
                    return { lines: Math.round(desc.height / 18), btnTop: btn.top, titleTop: title.top, descBottom: desc.bottom, btnRight: btn.right, headRight: head.right };
                })
            );
            for (const [i, r] of rows.entries()) {
                check(r.lines >= 2, `[${width}] panel ${i + 1}: the description should run to two lines for this check (got ${r.lines})`);
                check(r.btnTop < r.titleTop + 12 && r.headRight - r.btnRight < 2, `[${width}] panel ${i + 1}: the actions wrapped under the text (button top ${Math.round(r.btnTop)}, title top ${Math.round(r.titleTop)})`);
            }
            // Expanded: the body scrolls inside itself, above the source.
            await visit(p, expanded);
            await p.click('button[aria-label="Open full screen"]');
            await p.waitForSelector('[role="dialog"] [data-tall]');
            const ex = await p.evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]');
                const tall = dialog.querySelector('[data-tall]');
                const foot = dialog.querySelector('[data-source]').getBoundingClientRect();
                let el = tall.parentElement;
                while (el && el !== dialog && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
                const box = el.getBoundingClientRect();
                return { scroller: el === dialog ? 'dialog' : 'body', bottom: box.bottom, footTop: foot.top, footVisible: foot.bottom <= innerHeight + 1 };
            });
            check(ex.scroller === 'body' && ex.bottom <= ex.footTop + 0.5 && ex.footVisible, `[${width}] expanded panel: a tall body runs under the source (scroller ${ex.scroller}, its bottom ${Math.round(ex.bottom)}, the source at ${Math.round(ex.footTop)})`);
            // The app frames clip what is positioned inside them.
            for (const [name, url] of [
                ['ToolShell app', tool],
                ['AppShell rail', rail],
            ]) {
                await visit(p, url);
                const doc = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, view: innerHeight }));
                check(doc.scroll <= doc.view, `[${width}] ${name}: sr-only text in the page's scroller stretches the document to ${doc.scroll}px in a ${doc.view}px window`);
            }
            await visit(p, wide);
            const across = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
            check(across.scroll <= across.view, `[${width}] ScrollFade: sr-only text in a wide table widens the page to ${across.scroll}px in a ${across.view}px window`);
            // One column: every title at the gutter of one centred 72rem column. A tool page sits in the frame,
            // so its gutter starts past the frame's 1px rule; an app frame has none.
            for (const [name, url] of columns) {
                const rule = name.startsWith('app') ? 0 : 1;
                const gutter = Math.max((width < 768 ? 16 : 32) + rule, (width - 1152) / 2);
                await visit(p, url);
                const box = await p.evaluate(() => ({
                    left: document.querySelector('main h1').getBoundingClientRect().left,
                    width: document.querySelector('main header')?.getBoundingClientRect().width,
                    foot: document.querySelector('footer a[href="https://ochk.io"]')?.getBoundingClientRect().left,
                    footTop: document.querySelector('footer')?.getBoundingClientRect().top,
                }));
                if (box.footTop !== undefined) check(box.footTop >= height - 0.5, `[${width}] ${name}: the footer starts at ${Math.round(box.footTop)}px, inside a ${height}px window`);
                check(Math.abs(box.left - gutter) < 0.5, `[${width}] ${name}: the title starts at ${Math.round(box.left)}px, not the column's ${gutter}px`);
                if (box.foot !== undefined) check(Math.abs(box.foot - gutter) < 0.5, `[${width}] ${name}: the footer's lockup starts at ${Math.round(box.foot)}px, not the column's ${gutter}px`);
                if (name === 'narrow') check(box.width <= 768.5, `[${width}] narrow: the page runs ${Math.round(box.width)}px wide, past 48rem`);
            }
            // A menu's items and a pane's rows: 44px on a phone; the row's time clear of its actions.
            await visit(p, menu);
            await p.waitForSelector('[role="menuitem"]');
            const items = await p.$$eval('[role="menuitem"]', (els) => els.map((e) => e.getBoundingClientRect().height));
            check(items.length === 2 && items.every((x) => (width < 768 ? x >= 44 : x <= 40.5)), `[${width}] menu items are ${items.map(Math.round).join('/')}px tall`);
            await visit(p, paneRows);
            const rowBoxes = await p.$$eval('li', (lis) =>
                lis.map((li) => {
                    const row = li.firstElementChild.getBoundingClientRect();
                    const meta = li.querySelector('.oca-tabular').getBoundingClientRect();
                    const act = li.querySelector('[data-act]').getBoundingClientRect();
                    const pic = li.querySelector('[aria-hidden].rounded-full')?.getBoundingClientRect();
                    return { h: row.height, gap: act.left - meta.right, pic: pic ? [pic.width, pic.height] : null };
                })
            );
            for (const [i, r] of rowBoxes.entries()) {
                check(r.h >= 44, `[${width}] pane row ${i + 1} is ${Math.round(r.h)}px tall`);
                check(r.gap >= 4, `[${width}] pane row ${i + 1}: the time runs under the actions (gap ${Math.round(r.gap)}px)`);
                if (r.pic) check(r.pic[0] === 44 && r.pic[1] === 44, `[${width}] pane row ${i + 1}: the avatar is ${r.pic.join('×')}, not 44×44`);
            }
            // Targets: a press anywhere in the 44px around the control's middle lands on it.
            await visit(p, targets);
            const reach = await p.evaluate(() => {
                const probe = (el) => {
                    el.scrollIntoView({ block: 'center' });
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                    return { tall: lands(cx, cy - 21.5) && lands(cx, cy + 21.5), wide: lands(cx - 21.5, cy) && lands(cx + 21.5, cy), height: r.height };
                };
                const footer = document.querySelector('footer a[href="https://ochk.io"]');
                return {
                    lockup: probe(footer),
                    lockupHeight: footer.querySelector('svg, span').getBoundingClientRect().height,
                    download: probe(document.querySelector('button[aria-label="Download a.stamp"]')),
                    copy: probe(document.querySelector('button[aria-label="Copy code"]')),
                    view: probe(document.querySelector('[aria-label="View"] button')),
                    chip: probe(document.querySelector('[role="group"][aria-label="State"] button')),
                };
            });
            if (width < 768) {
                for (const k of ['lockup', 'download', 'copy', 'view', 'chip']) check(reach[k].tall, `[${width}] ${k}: a press 22px above or below its middle misses it`);
                for (const k of ['download', 'copy']) check(reach[k].wide, `[${width}] ${k}: a press 22px beside its middle misses it`);
                check(reach.lockup.height < 40, `[${width}] lockup: the link grew to ${Math.round(reach.lockup.height)}px; its look should not change`);
            } else {
                // A desk keeps the compact sizes.
                check(reach.download.height <= 28.5 && reach.chip.height <= 36.5, `[${width}] the bar and chips grew on a desk (download ${reach.download.height}, chip ${reach.chip.height})`);
            }
            // A failed read and one that never answers: the line under each stays put, and nothing shifts.
            const q = await browser.newPage({ viewport: { width, height } });
            await q.addInitScript(() => {
                window.__shift = 0;
                new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__shift += e.value))).observe({ type: 'layout-shift', buffered: true });
            });
            await visit(q, loadErr);
            await q.waitForSelector('[data-case="fails"] [role="status"]');
            const under = () => q.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-case]')].map((c) => [c.dataset.case, c.querySelector('[data-below]').getBoundingClientRect().top - c.getBoundingClientRect().top])));
            const held = await under();
            await q.waitForSelector('[data-case="fails"] [role="alert"]');
            await q.waitForSelector('[data-case="late"] [role="note"]');
            const swapped = await under();
            const shift = await q.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => done(window.__shift), 50)))));
            for (const k of ['fails', 'late']) check(Math.abs(swapped[k] - held[k]) < 0.5, `[${width}] ${k === 'fails' ? 'LoadError' : 'a timed-out LoadingBlock'} moved the line under it ${(swapped[k] - held[k]).toFixed(1)}px`);
            check(shift < 0.001, `[${width}] a failed read shifted the page by ${shift.toFixed(4)}`);
            await q.close();
            await p.close();
            // The header CTA pending, then resolved: no box moves, and the pending one names nothing and takes no focus.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 } });
                await visit(c, ctaSwap);
                const boxes = await c.evaluate(() =>
                    Object.fromEntries(
                        ['pending', 'resolved'].map((k) => {
                            const root = document.querySelector(`[data-cta-case="${k}"]`);
                            const cta = root.querySelector('[data-oca-cta]');
                            const r = cta.getBoundingClientRect();
                            const links = [...root.querySelectorAll('nav[aria-label="Main"] a')].map((a) => Math.round(a.getBoundingClientRect().left));
                            // The label itself: the first in CtaLabel's one-cell grid.
                            const label = cta.querySelector('.grid > span');
                            return [
                                k,
                                {
                                    x: Math.round(r.left),
                                    w: Math.round(r.width),
                                    h: Math.round(r.height),
                                    links,
                                    tag: cta.tagName,
                                    hidden: cta.getAttribute('aria-hidden'),
                                    focusable: cta.matches('a[href], button, [tabindex]:not([tabindex="-1"])') || Boolean(cta.querySelector('a[href], button, [tabindex]:not([tabindex="-1"])')),
                                    visibility: getComputedStyle(label).visibility,
                                },
                            ];
                        })
                    )
                );
                const [pd, rs] = [boxes.pending, boxes.resolved];
                check(pd.x === rs.x && pd.w === rs.w && pd.h === rs.h, `[${width}] the header CTA moved from pending to resolved: ${JSON.stringify([pd, rs].map(({ x, w, h }) => ({ x, w, h })))}`);
                check(JSON.stringify(pd.links) === JSON.stringify(rs.links), `[${width}] the nav moved when the CTA resolved: ${pd.links} → ${rs.links}`);
                check(pd.tag === 'SPAN' && pd.hidden === 'true' && !pd.focusable && pd.visibility === 'hidden', `[${width}] a pending CTA is focusable or says its label: ${JSON.stringify(pd)}`);
                check(rs.tag === 'A' && rs.visibility === 'visible', `[${width}] the resolved CTA is not a visible link`);
                await c.close();
            }
            // The header on a phone, at 390 and the 360 some phones still have.
            if (width < 768) {
                for (const w of [390, 360]) {
                    const c = await browser.newPage({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
                    await visit(c, narrow);
                    await c.evaluate(() => document.fonts.ready);
                    const rows = await c.evaluate(() =>
                        [...document.querySelectorAll('[data-hdr]')].map((d) => {
                            const row = d.querySelector('header > div');
                            const kids = [...row.children].map((k) => k.getBoundingClientRect());
                            // The lockup itself: its link may be squeezed narrower than what it draws.
                            const brand = d.querySelector('header a[href="/"] > span').getBoundingClientRect();
                            return {
                                hdr: d.dataset.hdr,
                                over: row.scrollWidth - row.clientWidth,
                                right: Math.max(...kids.map((k) => k.right)) - document.documentElement.clientWidth,
                                // The brand ends before the next thing in the row starts.
                                clash: kids.length > 1 ? brand.right - Math.min(...kids.slice(1).map((k) => k.left)) : 0,
                            };
                        })
                    );
                    for (const r of rows) check(r.over <= 1 && r.right <= 1 && r.clash <= 0, `[${w}] the ${r.hdr} header with the product word "${longest}" overflows: ${JSON.stringify(r)}`);
                    await c.close();
                }
            }
            // A product footer's seven columns (three of its own and the family's four): one row from
            // 1280, and below that rows as even as the width allows, never six and a straggler.
            if (width === 1440) {
                for (const w of [768, 1024, 1280, 1440]) {
                    const c = await browser.newPage({ viewport: { width: w, height: 900 } });
                    await visit(c, productFooter);
                    await c.evaluate(() => document.fonts.ready);
                    const tops = await c.evaluate(() => [...document.querySelectorAll('footer [class~="md:flex"] > .oca-label')].map((l) => Math.round(l.getBoundingClientRect().top)));
                    const rows = Object.values(tops.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}));
                    const even = Math.max(...rows) - Math.min(...rows) <= 1 && (rows.length === 1 || Math.min(...rows) > 1);
                    check(tops.length === 7, `[${w}] the product footer drew ${tops.length} columns, not 7`);
                    check(w >= 1280 ? rows.length === 1 : even, `[${w}] the product footer's 7 columns sit in rows of ${rows.join(' + ')}${w >= 1280 ? ', not one row' : ', not as even as the width allows'}`);
                    await c.close();
                }
            }
            // The page's bands on the header's frame, and the H1 the largest text read.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, framedPage);
                await c.evaluate(() => document.fonts.ready);
                const f = await c.evaluate(() => {
                    const left = (el) => Math.round(el.getBoundingClientRect().left);
                    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
                    const h1 = document.querySelector('h1');
                    const read = [...document.querySelectorAll('body *')].filter((el) => !el.closest('[aria-hidden="true"]') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
                    const biggest = read.reduce((m, el) => (size(el) > size(m) ? el : m), h1);
                    return {
                        brand: left(document.querySelector('header a[href="/"] > span')),
                        hero: left(h1),
                        closing: left([...document.querySelectorAll('h2')].at(-1)),
                        h1: size(h1),
                        biggest: [biggest.tagName, size(biggest), biggest.textContent.trim().slice(0, 30)],
                        // A framed section's Frame fills it top to bottom, so its hairlines meet the next section's.
                        gaps: [...document.querySelectorAll('section')]
                            .filter((sec) => sec.firstElementChild?.matches('[data-oca-frame]'))
                            .map((sec) => {
                                const [a, b] = [sec, sec.firstElementChild].map((el) => el.getBoundingClientRect());
                                return Math.round(Math.max(Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom)));
                            }),
                    };
                });
                check(Math.abs(f.hero - f.brand) <= 1 && Math.abs(f.closing - f.brand) <= 1, `[${width}] the hero and the closing are off the header's frame: brand ${f.brand}, hero ${f.hero}, closing ${f.closing}`);
                check(f.gaps.length >= 2 && f.gaps.every((g) => g <= 1), `[${width}] a framed section's hairlines stop short of its edges by ${JSON.stringify(f.gaps)}px`);
                check(f.biggest[1] <= f.h1, `[${width}] the H1 (${f.h1}px) is not the largest text: ${JSON.stringify(f.biggest)}`);
                await c.close();
            }
            // The entrance on its first frame: every animation paused at 0.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, heroes);
                const e = await c.evaluate(() => {
                    for (const a of document.getAnimations()) {
                        a.pause();
                        a.currentTime = 0;
                    }
                    const read = (el) => {
                        const cs = getComputedStyle(el);
                        return { opacity: cs.opacity, filter: cs.filter, transform: cs.transform, animation: cs.animationName };
                    };
                    return {
                        heroes: Object.fromEntries(
                            ['split', 's10', 'document', 'error'].map((t) => {
                                const s = document.querySelector(`[data-t="${t}"]`);
                                return [t, { h1: read(s.querySelector('h1')), lead: read(s.querySelector('.oca-lead')), eyebrow: read(s.querySelector('h1').parentElement.querySelector('.oca-enter')) }];
                            })
                        ),
                        blurred: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).filter.includes('blur')).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`),
                        reveal: read(document.querySelector('[data-t="reveal"]')),
                    };
                });
                for (const [t, x] of Object.entries(e.heroes)) {
                    // The h1 still rises; a lead rises with it, or (a document's) has no entrance.
                    check(x.h1.opacity === '1' && x.h1.animation === 'oca-enter-lift' && x.h1.transform !== 'none', `[${width}] ${t} hero's h1 is not opaque and rising on the entrance's first frame: ${JSON.stringify(x.h1)}`);
                    check(x.lead.opacity === '1' && ['oca-enter-lift', 'none'].includes(x.lead.animation), `[${width}] ${t} hero's lead is not opaque on the entrance's first frame: ${JSON.stringify(x.lead)}`);
                    check(x.eyebrow.opacity === '0', `[${width}] ${t} hero's eyebrow no longer fades in (opacity ${x.eyebrow.opacity} on the first frame)`);
                }
                check(e.blurred.length === 0, `[${width}] an entrance blurs on its first frame: ${e.blurred.join(', ')}`);
                check(e.reveal.opacity === '0' && !e.reveal.filter.includes('blur'), `[${width}] a pending Reveal is blurred or not hidden: ${JSON.stringify(e.reveal)}`);
                await c.close();
            }
            // Reduced motion: no animation or transition waits out a delay. Without it the entrances keep theirs.
            {
                const delays = async (reduce) => {
                    const c = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
                    await visit(c, heroes);
                    const d = await c.evaluate(() => {
                        const all = [...document.querySelectorAll('*')];
                        return {
                            animated: all.filter((el) => getComputedStyle(el).animationName !== 'none').map((el) => [`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`, getComputedStyle(el).animationDelay]),
                            reveal: getComputedStyle(document.querySelector('[data-t="reveal"]')).transitionDelay,
                        };
                    });
                    await c.close();
                    return d;
                };
                const [still, moving] = [await delays(true), await delays(false)];
                const held = still.animated.filter(([, delay]) => delay !== '0s');
                check(still.animated.length > 0 && held.length === 0, `[${width}] under reduced motion an entrance still waits out its delay: ${JSON.stringify(held)}`);
                check(!still.reveal.split(',').some((t) => parseFloat(t) > 0), `[${width}] under reduced motion a Reveal still waits out a delay: ${still.reveal}`);
                check(moving.animated.some(([, delay]) => delay !== '0s') && moving.reveal.split(',').some((t) => parseFloat(t) > 0), `[${width}] no entrance or Reveal has a delay without reduced motion, so this check reads nothing: ${moving.reveal}`);
            }
            // A hero's CTA pair, and the closing band's: full width and stacked on a phone (at 320 as at 390), a row of
            // their own widths from 640px.
            for (const w of width < 768 ? [320, width] : [width]) {
                const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
                await visit(c, heroActions);
                await c.evaluate(() => document.fonts.ready);
                const a = await c.evaluate(() =>
                    Object.fromEntries(
                        ['split', 's10', 'document', 'error', 'closing'].map((t) => {
                            const [x, y] = [...document.querySelectorAll(`[data-t="${t}"] [data-cta]`)].map((b) => b.getBoundingClientRect());
                            const col = document.querySelector(`[data-t="${t}"] [data-cta]`).parentElement.parentElement;
                            const cs = getComputedStyle(col);
                            const inner = col.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                            return [t, { widths: [Math.round(x.width), Math.round(y.width)], column: Math.round(inner), stacked: y.top >= x.bottom, level: Math.abs(x.top - y.top) < 1, order: x.top < y.top || (x.top === y.top && x.left < y.left) }];
                        })
                    )
                );
                for (const [t, m] of Object.entries(a)) {
                    if (w < 640) {
                        check(m.stacked && m.order && m.widths.every((x) => Math.abs(x - m.column) <= 1), `[${w}] ${t}'s two actions are not stacked at the column's full width (${m.column}px): ${JSON.stringify(m)}`);
                    } else {
                        check(m.level && m.order && m.widths[0] !== m.widths[1], `[${w}] ${t}'s two actions are not side by side at their own widths: ${JSON.stringify(m)}`);
                    }
                }
                await c.close();
            }
            // StatRow: no value runs out of its cell at either size, and size="sm" is the smaller figure.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, statRows);
                await c.evaluate(() => document.fonts.ready);
                const st = await c.evaluate(() =>
                    Object.fromEntries(
                        [...document.querySelectorAll('dl[data-t]')].map((dl) => {
                            const over = [...dl.querySelectorAll('dd')]
                                .map((dd) => {
                                    const r = document.createRange();
                                    r.selectNodeContents(dd);
                                    const cell = dd.parentElement.getBoundingClientRect();
                                    const cs = getComputedStyle(dd.parentElement);
                                    return [dd.textContent, Math.round(r.getBoundingClientRect().right - (cell.right - parseFloat(cs.paddingRight)))];
                                })
                                .filter(([, px]) => px > 1);
                            return [dl.dataset.t, { over, size: parseFloat(getComputedStyle(dl.querySelector('dd')).fontSize) }];
                        })
                    )
                );
                check(st.md.over.length === 0 && st.sm.over.length === 0, `[${width}] StatRow: a value runs out of its cell by px: ${JSON.stringify({ md: st.md.over, sm: st.sm.over })}`);
                check(st.sm.size < st.md.size, `[${width}] StatRow size="sm" draws its figures at ${st.sm.size}px, not under the default's ${st.md.size}px`);
                await c.close();
            }
            // One framed column: the header's lockup, the hero's eyebrow and H1, a SectionBar's square, a
            // section heading and its first card start on one x; the rules run unbroken from the header's
            // foot to the footer's top (no full-bleed stage on this page), beside the ink band too; and each
            // section's closing hairline, the hero's included, runs from rule to rule.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, oneFrame);
                await c.evaluate(() => document.fonts.ready);
                const f = await c.evaluate(() => {
                    const r = (el) => el.getBoundingClientRect();
                    const textStart = (el) => {
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        return range.getClientRects()[0]?.left ?? r(el).left;
                    };
                    const frame = document.querySelector('[data-oca-page-frame]');
                    const fr = r(frame);
                    const header = document.querySelector('header');
                    const footer = document.querySelector('footer');
                    const square = (label) => r(label.querySelector('span[aria-hidden]') ?? label).left;
                    const after = (sec) => {
                        const cs = getComputedStyle(sec, '::after');
                        const box = r(sec);
                        return cs.content === 'none' ? null : { left: box.left + parseFloat(cs.left), width: parseFloat(cs.width) };
                    };
                    return {
                        frame: { left: fr.left, right: fr.right, top: fr.top + scrollY, bottom: fr.bottom + scrollY },
                        headerBottom: r(header).bottom + scrollY,
                        footerTop: r(footer).top + scrollY,
                        axis: {
                            lockup: r(header.querySelector('a[href="/"] svg')).left,
                            eyebrow: square(document.querySelector('[data-oca-page-frame] section [data-ui="label"]')),
                            h1: textStart(document.querySelector('h1')),
                            bar: square(document.querySelector('[data-t="bar"]')),
                            h2: textStart(document.querySelector('[data-t="h2"]')),
                            card: r(document.querySelector('[data-t="card"]')).left,
                            inkH2: textStart(document.querySelector('[data-t="ink-h2"]')),
                        },
                        hairlines: [...frame.querySelectorAll(':scope > section')].map((sec) => ({ s: sec.dataset.s ?? sec.dataset.ground ?? 'hero', ...after(sec) })),
                        bar: { left: r(document.querySelector('[data-t="bar"]')).left, width: r(document.querySelector('[data-t="bar"]')).width },
                        ruleColor: getComputedStyle(frame).borderLeftColor,
                        dpr: devicePixelRatio,
                    };
                });
                const xs = Object.values(f.axis);
                check(Math.max(...xs) - Math.min(...xs) <= 1, `[${width}] one frame: the page's left edges are not on one axis: ${JSON.stringify(Object.fromEntries(Object.entries(f.axis).map(([k, v]) => [k, Math.round(v * 10) / 10])))}`);
                const inner = f.frame.right - f.frame.left - 2;
                const short = f.hairlines.filter((l) => l.width === undefined || Math.abs(l.width - inner) > 1 || Math.abs(l.left - (f.frame.left + 1)) > 1);
                // A SectionBar's rule runs the frame's width too, between the side rules.
                check(Math.abs(f.bar.width - inner) <= 1 && Math.abs(f.bar.left - (f.frame.left + 1)) <= 1, `[${width}] one frame: a SectionBar's rule is ${f.bar.width.toFixed(1)}px from ${f.bar.left.toFixed(1)}, not the frame's ${inner}px between its rules`);
                check(f.hairlines.length >= 3 && short.length === 0, `[${width}] one frame: a section's closing hairline does not run from rule to rule (${inner}px): ${JSON.stringify(short)}`);
                // The rules, pixel by pixel, down the page: every row from the header's foot to the footer's top.
                const png = decodePng(await c.screenshot({ fullPage: true }));
                const at = (x, y) => {
                    const i = (Math.round(y * f.dpr) * png.width + Math.round(x * f.dpr)) * 4;
                    return [png.data[i], png.data[i + 1], png.data[i + 2]];
                };
                const want = f.ruleColor.match(/\d+/g).slice(0, 3).map(Number);
                const broken = [];
                for (const x of [f.frame.left, f.frame.right - 1]) {
                    for (let y = Math.ceil(f.headerBottom) + 1; y < Math.floor(f.footerTop) - 1; y++) {
                        const px = at(x, y);
                        if (px.some((v, k) => Math.abs(v - want[k]) > 6)) broken.push([Math.round(x), y, px.join()]);
                    }
                }
                check(broken.length === 0, `[${width}] one frame: a rule breaks between the header and the footer at ${broken.length} rows, first ${JSON.stringify(broken.slice(0, 3))} (want ${want.join()})`);
                await c.close();
            }
            // SectionBars in every parent, at 320, 390 and 1440: each spans its nearest edged box exactly (the
            // frame between its rules, or a card inside its border), its square on that box's axis, and the
            // page never scrolls sideways.
            if (width === 1440) {
                for (const w of [320, 390, 1440]) {
                    const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
                    await visit(c, bars);
                    await c.evaluate(() => document.fonts.ready);
                    const b = await c.evaluate(() => {
                        const r = (el) => el.getBoundingClientRect();
                        const frame = document.querySelector('[data-box="frame"]');
                        const fr = r(frame);
                        const inner = { left: fr.left + 1, right: fr.right - 1 };
                        const axis = r(document.querySelector('header a[href="/"] svg')).left;
                        const card = document.querySelector('[data-box="card"]');
                        const cr = r(card);
                        const cardInner = { left: cr.left + 1, right: cr.right - 1 };
                        const range = document.createRange();
                        range.selectNodeContents(document.querySelector('[data-axis="card"]'));
                        const cardAxis = range.getClientRects()[0].left;
                        return {
                            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                            bars: [...document.querySelectorAll('[data-bar]')].map((el) => {
                                const box = el.dataset.bar === 'card' ? cardInner : inner;
                                const want = el.dataset.bar === 'card' ? cardAxis : axis;
                                const square = r(el.querySelector('[data-ui="label"] span[aria-hidden]'));
                                return { k: el.dataset.bar, dl: Math.round((r(el).left - box.left) * 10) / 10, dr: Math.round((r(el).right - box.right) * 10) / 10, axis: Math.round((square.left - want) * 10) / 10 };
                            }),
                        };
                    });
                    const off = b.bars.filter((x) => Math.abs(x.dl) > 1 || Math.abs(x.dr) > 1 || Math.abs(x.axis) > 1);
                    check(b.bars.length === 6 && off.length === 0, `[${w}] SectionBar: a bar does not span its box or sits off its axis (px off left, right, axis): ${JSON.stringify(off)}`);
                    check(b.scroll <= 0, `[${w}] SectionBar: the page scrolls ${b.scroll}px sideways`);
                    await c.close();
                }
            }
            // The frame's edge cases. A nested PageFrame draws no second rule and moves nothing; a container
            // inside a Section adds no second gutter; a flush control's focus ring is whole at the foot of
            // its clipped Section (it matches the ring beside it).
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, frameEdges);
                await c.evaluate(() => document.fonts.ready);
                await c.keyboard.press('Tab');
                for (let i = 0; i < 12 && !(await c.evaluate(() => document.activeElement?.dataset.t === 'flush')); i++) await c.keyboard.press('Tab');
                await c.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
                const e = await c.evaluate(() => {
                    const r = (el) => el.getBoundingClientRect();
                    const outer = document.querySelector('[data-t="outer"]');
                    const inner = document.querySelector('[data-t="inner"]');
                    const own = document.querySelector('[data-t="own-container"]');
                    const range = document.createRange();
                    range.selectNodeContents(own);
                    const btn = document.querySelector('[data-t="flush"]');
                    return {
                        focused: document.activeElement === btn,
                        rules: [getComputedStyle(outer).borderLeftWidth, getComputedStyle(inner).borderLeftWidth],
                        lockup: r(document.querySelector('header a[href="/"] svg')).left,
                        own: range.getClientRects()[0].left,
                        btn: { left: r(btn).left, right: r(btn).right, top: r(btn).top + scrollY, bottom: r(btn).bottom + scrollY },
                        dpr: devicePixelRatio,
                    };
                });
                check(e.rules[0] === '1px' && e.rules[1] === '0px', `[${width}] frame edges: a nested PageFrame draws a rule of its own (${e.rules.join(', ')}), doubling the frame's`);
                check(Math.abs(e.own - e.lockup) <= 1, `[${width}] frame edges: a container inside a Section starts at ${e.own.toFixed(1)}, a second gutter off the axis ${e.lockup.toFixed(1)}`);
                const png = decodePng(await c.screenshot({ fullPage: true }));
                const at = (x, y) => {
                    const i = (Math.round(y * e.dpr) * png.width + Math.round(x * e.dpr)) * 4;
                    return [png.data[i], png.data[i + 1], png.data[i + 2]];
                };
                const midY = (e.btn.top + e.btn.bottom) / 2;
                const side = at(e.btn.left - 3, midY);
                const foot = at((e.btn.left + e.btn.right) / 2, e.btn.bottom + 3);
                check(e.focused && foot.every((v, k) => Math.abs(v - side[k]) <= 8), `[${width}] frame edges: the flush control's focus ring is cut at its section's foot (${foot.join()} under it, ${side.join()} beside it)`);
                await c.close();
            }
            // DocsShell in the frame, at a desk and wider: its sidebar starts on the header's axis, and the
            // frame's rules run beside the sidebar and the page down to the footer.
            if (width === 1440) {
                for (const w of [1440, 1920]) {
                    const c = await browser.newPage({ viewport: { width: w, height: 900 } });
                    await visit(c, docsFrame);
                    await c.evaluate(() => document.fonts.ready);
                    const d = await c.evaluate(() => {
                        const r = (el) => el.getBoundingClientRect();
                        const frame = document.querySelector('[data-oca-page-frame]');
                        const grid = frame.querySelector('.oca-container');
                        const sidebar = grid.firstElementChild;
                        return {
                            lockup: r(document.querySelector('header a[href="https://ochk.io"] svg, header a svg')).left,
                            sidebar: r(sidebar).left,
                            frame: { left: r(frame).left, right: r(frame).right },
                            headerBottom: r(document.querySelector('header')).bottom + scrollY,
                            footerTop: r(document.querySelector('footer')).top + scrollY,
                            ruleColor: getComputedStyle(frame).borderLeftColor,
                        };
                    });
                    check(Math.abs(d.sidebar - d.lockup) <= 1, `[${w}] DocsShell: the sidebar starts at ${d.sidebar.toFixed(1)}, off the header's axis ${d.lockup.toFixed(1)}`);
                    const png = decodePng(await c.screenshot({ fullPage: true }));
                    const want = d.ruleColor.match(/\d+/g).slice(0, 3).map(Number);
                    const broken = [];
                    for (const x of [d.frame.left, d.frame.right - 1]) {
                        for (let y = Math.ceil(d.headerBottom) + 1; y < Math.floor(d.footerTop) - 1; y++) {
                            const i = (y * png.width + Math.round(x)) * 4;
                            if ([0, 1, 2].some((k) => Math.abs(png.data[i + k] - want[k]) > 6)) broken.push([Math.round(x), y]);
                        }
                    }
                    check(broken.length === 0 && d.footerTop - d.headerBottom > 200, `[${w}] DocsShell: the frame's rules break at ${broken.length} rows between the header and the footer, first ${JSON.stringify(broken.slice(0, 3))}`);
                    await c.close();
                }
            }
            // A section is a closed box: under a hero with a depiction, the next section's top rows are
            // its own ground, nothing the hero drew. A framed Section clips on both axes, leaving only a
            // focus ring's reach (--oca-focus-reach) past its edge.
            {
                // The hero's entrance played out first: mid-entrance its art is transparent and shows nothing.
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'reduce' });
                await visit(c, closedBox);
                await c.evaluate(() => document.fonts.ready);
                await c.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
                const g = await c.evaluate(() => {
                    const next = document.querySelector('[data-s="next"]');
                    const r = next.getBoundingClientRect();
                    const probe = document.querySelector('[data-probe]').getBoundingClientRect();
                    // Where the probe's shadow is drawn: the probe's own box, 100px lower.
                    // Its ground: the nearest ancestor that paints one.
                    let ground = 'rgba(0, 0, 0, 0)';
                    for (let el = next; el && /rgba\(0, 0, 0, 0\)|transparent/.test(ground); el = el.parentElement) ground = getComputedStyle(el).backgroundColor;
                    if (/rgba\(0, 0, 0, 0\)/.test(ground)) ground = getComputedStyle(document.documentElement).backgroundColor;
                    // The token that sets the clip's margin, read only to hold it to the ring it is for.
                    const token = getComputedStyle(document.documentElement).getPropertyValue('--oca-focus-reach').trim();
                    return { top: r.top + scrollY, left: r.left, right: r.right, ground, token, dpr: devicePixelRatio, probe: { left: probe.left, right: probe.right, top: probe.top + scrollY + 100 } };
                });
                const png = decodePng(await c.screenshot({ fullPage: true }));
                const want = g.ground.match(/\d+/g).slice(0, 3).map(Number);
                // Not a vacuous pass: the probe is drawn, red, in the hero just above the next section.
                const pi = (Math.round((g.top - 4) * g.dpr) * png.width + Math.round(((g.probe.left + g.probe.right) / 2) * g.dpr)) * 4;
                check(g.probe.top < g.top - 4 && png.data[pi] > 200 && png.data[pi + 1] < 60, `[${width}] closed box: the overflow probe is not drawn above the next section, so the check would see nothing`);
                const smudged = [];
                // A focus ring reaches 4px (ring-2 plus ring-offset-2), fixed here rather than read from the
                // token it guards; the clip may let exactly that much through, and the first row past it is clean.
                const REACH = 4;
                check(g.token === `${REACH}px`, `[${width}] closed box: --oca-focus-reach is ${g.token}, not a focus ring's ${REACH}px`);
                for (let y = Math.ceil(g.top + REACH); y < g.top + 24; y++) {
                    for (let x = Math.ceil(g.left) + 1; x < g.right - 1; x += 2) {
                        const i = (Math.round(y * g.dpr) * png.width + Math.round(x * g.dpr)) * 4;
                        const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
                        if (px.some((v, k) => Math.abs(v - want[k]) > 3)) smudged.push([Math.round(x), y, px.join()]);
                    }
                }
                check(smudged.length === 0, `[${width}] closed box: the hero paints into the next section's top rows at ${smudged.length} points, first ${JSON.stringify(smudged.slice(0, 3))} (its ground is ${want.join()})`);
                await c.close();
            }
            // S10: from md the title at the top, the lead at the foot on the right, the mark at the foot
            // on the left, both on the header's frame; on a phone the mark under the lead.
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, s10Page);
                await c.evaluate(() => document.fonts.ready);
                const g = await c.evaluate(() => {
                    const box = (el) => el.getBoundingClientRect();
                    const frame = document.querySelector('section [data-oca-frame]');
                    const fs = getComputedStyle(frame);
                    const fr = box(frame);
                    const content = { left: fr.left + parseFloat(fs.paddingLeft), right: fr.right - parseFloat(fs.paddingRight) };
                    const [sec, h1, lead, art] = [document.querySelector('section'), document.querySelector('section h1'), document.querySelector('section .oca-lead'), document.querySelector('[data-art]')].map(box);
                    const fb = box(frame);
                    return { align: getComputedStyle(document.querySelector('section .oca-lead')).textAlign, gap: Math.max(Math.abs(sec.top - fb.top), Math.abs(sec.bottom - fb.bottom)), content, sec: { top: sec.top, h: sec.height }, h1: { top: h1.top, bottom: h1.bottom }, lead: { left: lead.left, right: lead.right, top: lead.top, bottom: lead.bottom }, art: { left: art.left, right: art.right, top: art.top, bottom: art.bottom } };
                });
                const near = (a, b) => Math.abs(a - b) <= 1;
                check(g.gap <= 1, `[${width}] S10: the frame's hairlines stop ${Math.round(g.gap)}px short of the band's edges`);
                // The lead is a block of left-aligned text set at the right, not a ragged-left paragraph.
                check(['start', 'left'].includes(g.align), `[${width}] S10: the lead is set ${g.align}, not left-aligned`);
                if (width >= 768) {
                    check(near(g.lead.right, g.content.right) && near(g.art.left, g.content.left), `[${width}] S10: the lead's right ${g.lead.right.toFixed(1)} or the mark's left ${g.art.left.toFixed(1)} is off the frame (${JSON.stringify(g.content)})`);
                    check(near(g.lead.top, g.art.top), `[${width}] S10: the lead's top ${g.lead.top.toFixed(1)} is not level with the mark's ${g.art.top.toFixed(1)}`);
                    check(g.art.top >= g.h1.bottom && g.lead.left > g.art.right, `[${width}] S10: the mark runs into the title or the lead (${JSON.stringify(g)})`);
                    if (width >= 900) check(g.sec.h >= 440, `[${width}] S10: the band is ${Math.round(g.sec.h)}px tall, under 27.5rem`);
                } else {
                    check(g.art.top >= g.lead.bottom && near(g.art.left, g.content.left), `[${width}] S10: on a phone the mark is not under the lead (${JSON.stringify({ lead: g.lead, art: g.art })})`);
                }
                await c.close();
            }
            // Chrome targets: the header's links, family menu, theme switch, Sign in and CTA, a footer
            // column's links (44px), and the legal row's inline links (24px).
            {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
                await visit(c, chromeTargets);
                const t = await c.evaluate(() => {
                    const hgt = (el) => Math.round(el.getBoundingClientRect().height);
                    const shown = (el) => el.getBoundingClientRect().width > 0;
                    const header = document.querySelector('header');
                    const footer = document.querySelector('footer');
                    return {
                        header: [...header.querySelectorAll('nav[aria-label="Main"] a, button, a[data-oca-cta], a[href]')].filter(shown).map((el) => [el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), hgt(el)]),
                        column: [...footer.querySelectorAll('div.md\\:flex a')].filter(shown).map((el) => [el.textContent.trim(), hgt(el)]),
                        legal: [...footer.querySelectorAll('nav[aria-label="Legal"] a')].filter(shown).map((el) => [el.textContent.trim(), hgt(el)]),
                    };
                });
                const short = (list, min) => list.filter(([, px]) => px < min);
                check(short(t.header, 44).length === 0, `[${width}] header controls under 44px: ${JSON.stringify(short(t.header, 44))}`);
                // To a thumb a target is 44px in both axes: a short word ('Terms') was 41px wide at 44 tall.
                if (width < 768) {
                    const boxes = await c.evaluate(() =>
                        [...document.querySelectorAll('header a, header button, footer a, footer button, footer summary')]
                            .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
                            .map((el) => {
                                const r = el.getBoundingClientRect();
                                return [el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)];
                            })
                    );
                    const small = boxes.filter(([, w, hh]) => w < 44 || hh < 44);
                    check(boxes.length >= 8 && small.length === 0, `[${width} touch] chrome targets under 44x44: ${small.length} of ${boxes.length}: ${JSON.stringify(small.slice(0, 6))}`);
                }
                if (width >= 768) check(t.column.length > 0 && short(t.column, 44).length === 0, `[${width}] footer column links under 44px: ${JSON.stringify(short(t.column, 44))}`);
                check(t.legal.length > 0 && short(t.legal, 24).length === 0, `[${width}] legal links under 24px: ${JSON.stringify(short(t.legal, 24))}`);
                await c.close();
            }
            // Inline link rows (the footer's legal and protocol rows, breadcrumbs) and filter chips follow
            // the pointer, not the width: 44px to a thumb on a tablet as on a phone, 24px to a mouse.
            if (width === 1440) {
                for (const touch of [true, false]) {
                    const c = await browser.newPage({ viewport: { width: 1024, height: 900 }, isMobile: touch, hasTouch: touch });
                    await visit(c, footRows);
                    const r = await c.evaluate(() => ({
                        coarse: matchMedia('(pointer: coarse)').matches,
                        links: [...document.querySelectorAll('footer nav[aria-label="Legal"] a, footer nav[aria-label="Protocols"] a, nav[aria-label="Breadcrumb"] a, [role="group"][aria-label="Status"] button')].map((a) => [`${a.closest('nav, [role="group"]').getAttribute('aria-label')}: ${a.textContent.trim()}`, Math.round(a.getBoundingClientRect().height), Math.round(a.getBoundingClientRect().width)]),
                    }));
                    const min = touch ? 44 : 24;
                    // A thumb's target is 44 wide too; a mouse's 24 is the height of a line of text.
                    const short = r.links.filter(([, px, w]) => px < min || (touch && w < 44));
                    check(r.coarse === touch, `[1024 ${touch ? 'touch' : 'mouse'}] the page's pointer reads ${r.coarse ? 'coarse' : 'fine'}`);
                    check(r.links.length >= 10 && short.length === 0, `[1024 ${touch ? 'touch' : 'mouse'}] inline links and chips: ${short.length} of ${r.links.length} under ${min}px: ${JSON.stringify(short.slice(0, 4))}`);
                    await c.close();
                }
                {
                    const c = await browser.newPage({ viewport: { width: 1440, height: 900 } });
                    await visit(c, statesPage);
                    const seen = await c.evaluate(() => document.querySelectorAll('[aria-current]:not([aria-current="false"]), [aria-pressed="true"], [data-state="active"]:not([role="tabpanel"])').length);
                    // Read dark at rest: a transition caught midway reads a colour of neither mode.
                    await c.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
                    await c.evaluate(() => document.documentElement.classList.add('dark'));
                    const dark = await stateEdges(c);
                    for (const d of dark) weak.set(`states.html dark: ${d}`, true);
                    check(seen >= 4, `the states page draws ${seen} chosen states, not the switcher, the current page, a pill tab and a chip`);
                    await c.close();
                }
                {
                    const c = await browser.newPage({ viewport: { width: 1280, height: 900 }, isMobile: true, hasTouch: true });
                    await visit(c, docsRail);
                    const rows = await c.evaluate(() =>
                        [...document.querySelectorAll('nav[aria-label="Docs"] a')].filter((a) => a.getClientRects().length > 0).map((a) => [a.textContent.trim(), Math.round(a.getBoundingClientRect().width), Math.round(a.getBoundingClientRect().height)])
                    );
                    const small = rows.filter(([, w, hh]) => w < 44 || hh < 44);
                    check(rows.length >= 3 && small.length === 0, `[1280 touch] docs rail rows under 44x44: ${small.length} of ${rows.length}: ${JSON.stringify(small)}`);
                    await c.close();
                }
                // Underline tabs, a sign-in frame's header links, an app shell's sidebar and rail, and a site header's
                // nav at 1024 (in the menu at 390 and to a mouse at 1440, so only a tablet touches it): to a thumb each
                // lands from 21.5px out in every direction, on the box or by a ::before. To a mouse they keep their
                // drawn size (a short tab or nav word its own width), and the sign-in header its height either way.
                {
                    const read = async (url, w, touch, sel) => {
                        const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: touch, hasTouch: touch });
                        await visit(c, url);
                        const r = await c.evaluate((q) => ({
                            header: Math.round(document.querySelector('main header')?.getBoundingClientRect().height ?? 0),
                            targets: [...document.querySelectorAll(q)]
                                .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 1)
                                .map((el) => {
                                    const b = el.getBoundingClientRect();
                                    const cx = b.left + b.width / 2;
                                    const cy = b.top + b.height / 2;
                                    const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                                    return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), w: Math.round(b.width), h: Math.round(b.height), reach: [[0, -21.5], [0, 21.5], [-21.5, 0], [21.5, 0]].every(([dx, dy]) => lands(cx + dx, cy + dy)) };
                                }),
                        }), sel);
                        await c.close();
                        return r;
                    };
                    const shapes = [
                        ['line tabs and the sign-in header', touchShapes, [390, 1024], '[data-t="line-tab"], main header a', 5],
                        ['the sign-in page header, Go back to the return target', touchSignInPage, [390, 1024], 'main header a', 2],
                        ['the app shell sidebar', touchShell, [1024], 'aside a', 5],
                        ['the app shell rail', touchRail, [768], 'nav[aria-label="Pages"] a', 2],
                        ['the site header nav', touchNav, [1024], 'nav[aria-label="Main"] a', 2],
                    ];
                    const mouse = {};
                    for (const [name, url, widths, sel, n] of shapes) {
                        for (const w of widths) {
                            const t = (await read(url, w, true, sel)).targets;
                            check(t.length === n && t.every((x) => x.reach), `[${w} touch] ${name}: ${t.filter((x) => !x.reach).length} of ${t.length} (want ${n}) not a 44px target: ${JSON.stringify(t.filter((x) => !x.reach))}`);
                        }
                        mouse[name] = await read(url, widths[widths.length - 1], false, sel);
                    }
                    const sizes = (name) => mouse[name].targets.map((x) => `${x.name} ${x.w}x${x.h}`).join(', ');
                    const dca = mouse['line tabs and the sign-in header'].targets.find((x) => x.name === 'DCA');
                    check(dca && dca.w < 44, `[1024 mouse] the DCA tab is ${dca?.w}px wide: a fine pointer's tab keeps its label's width`);
                    const touchHeader = (await read(touchShapes, 1024, true, 'main header a')).header;
                    check(touchHeader > 0 && touchHeader === mouse['line tabs and the sign-in header'].header, `[1024] the sign-in frame's header is ${touchHeader}px to a thumb and ${mouse['line tabs and the sign-in header'].header}px to a mouse`);
                    const goBack = mouse['the sign-in page header, Go back to the return target'];
                    const touchGoBack = (await read(touchSignInPage, 1024, true, 'main header a')).header;
                    check(goBack.targets.some((x) => x.name === 'Go back') && touchGoBack === goBack.header && goBack.header === mouse['line tabs and the sign-in header'].header, `[1024] the sign-in page's header with Go back is ${touchGoBack}px to a thumb and ${goBack.header}px to a mouse, not the frame's ${mouse['line tabs and the sign-in header'].header}px`);
                    // A mouse's drawn sizes: section switcher 32, page rows 36, rail icons 40.
                    const bar = mouse['the app shell sidebar'].targets;
                    check(bar.length === 5 && bar.filter((x) => ['Apps', 'Money'].includes(x.name)).every((x) => x.h === 32) && bar.filter((x) => ['Entries', 'Keys'].includes(x.name)).every((x) => x.h === 36), `[1024 mouse] the app shell sidebar is drawn ${sizes('the app shell sidebar')}, not sections 32 and rows 36`);
                    const earn = mouse['the site header nav'].targets.find((x) => x.name === 'Earn');
                    check(earn && earn.w < 44 && earn.h === 44, `[1024 mouse] the header's Earn is drawn ${earn?.w}x${earn?.h}: a fine pointer's nav word keeps its own width`);
                    check(mouse['the app shell rail'].targets.length === 2 && mouse['the app shell rail'].targets.every((x) => x.w === 40 && x.h === 40), `[768 mouse] the rail's icons are drawn ${sizes('the app shell rail')}, not 40x40`);
                }
                // Block heights to a thumb: each lands from 21.5px out in every direction, and no point of one's 44px square
                // lands on another height (a ::before 44 tall over a line of text can reach a neighbour). To a mouse each
                // keeps the box it draws.
                let thumbBoxes;
                for (const [w, touch] of [[390, true], [1024, true], [1024, false]]) {
                    const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: touch, hasTouch: touch });
                    await visit(c, touchHeights);
                    const r = await c.evaluate(() => {
                        const links = [...document.querySelectorAll('a[href*="mempool.space/block"]')];
                        return links.map((el) => {
                            el.scrollIntoView({ block: 'center' });
                            const b = el.getBoundingClientRect();
                            const cx = b.left + b.width / 2;
                            const cy = b.top + b.height / 2;
                            const at = (x, y) => document.elementFromPoint(x, y)?.closest('a[href*="mempool.space/block"]') ?? null;
                            const reach = [[0, -21.5], [0, 21.5], [-21.5, 0], [21.5, 0]].every(([dx, dy]) => at(cx + dx, cy + dy) === el);
                            let shared = 0;
                            for (let dx = -21; dx <= 21; dx += 3) for (let dy = -21; dy <= 21; dy += 3) {
                                const hit = at(cx + dx, cy + dy);
                                if (hit && hit !== el) shared++;
                            }
                            return { name: el.textContent.trim().slice(0, 7), w: Math.round(b.width), h: Math.round(b.height), reach, shared };
                        });
                    });
                    await c.close();
                    const label = `[${w} ${touch ? 'touch' : 'mouse'}]`;
                    if (touch) {
                        check(r.length === 10 && r.every((x) => x.reach), `${label} block heights: ${r.filter((x) => !x.reach).length} of ${r.length} not a 44px target: ${JSON.stringify(r.filter((x) => !x.reach).slice(0, 3))}`);
                        check(r.every((x) => x.shared === 0), `${label} block heights share hit points with a neighbour: ${JSON.stringify(r.filter((x) => x.shared))}`);
                        thumbBoxes = r;
                    } else {
                        check(r.length === 10 && r.every((x) => x.h < 44), `${label} a block height is drawn ${JSON.stringify(r[0])}: a fine pointer gets the line of text`);
                        check(thumbBoxes?.every((t, i) => t.w === r[i].w && t.h === r[i].h), `${label} a block height draws a different box to a thumb and a mouse: ${JSON.stringify([thumbBoxes?.[0], r[0]])}`);
                    }
                }
            }
            // Signed-in targets on a touch screen: 44px to a thumb, on the box or by a ::before, while
            // the Switch, the Checkbox's mark and a pill tab keep their drawn size.
            if (width < 768) {
                const c = await browser.newPage({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true });
                await visit(c, signedInTargets);
                await c.evaluate(() => document.fonts.ready);
                const got = await c.evaluate(() =>
                    [
                        ['menu', 'header button[aria-label="Open navigation"]'],
                        ['home lockup', 'header a'],
                        ['account menu', 'header button[aria-label$="account menu"]'],
                        ['Switch', '[data-t="switch"]'],
                        ['Checkbox', '[data-t="checkbox"]'],
                        ['Tabs trigger', '[data-t="tab"]'],
                    ].map(([name, sel]) => {
                        const el = document.querySelector(sel);
                        if (!el) return { name, missing: true };
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        return { name, w: Math.round(r.width), h: Math.round(r.height), reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) && (r.width >= 44 || (lands(cx - 21.5, cy) && lands(cx + 21.5, cy))) };
                    })
                );
                const DRAWN = { Switch: [44, 24], Checkbox: [20, 20], 'Tabs trigger': [null, 36] };
                for (const g of got) {
                    const [dw, dh] = DRAWN[g.name] ?? [null, null];
                    check(!g.missing && g.reach && (dw === null || g.w === dw) && (dh === null || g.h === dh), `[${width} touch] ${g.name}: drawn ${g.w}×${g.h}px, a 44px target ${g.reach}${g.missing ? ' (not found)' : ''}`);
                }
                await c.close();
            }
            // The wordmark: letters at their natural spacing (no gap between letter boxes past a
            // twentieth of an em, 0.05em), every glyph's ink inside the rise's clip, the descender of
            // the g included, and the word inside the frame's content box. Again before Inter loads
            // on a machine with no Arial, Liberation or Arimo: the next fallback (Noto here) must fit too.
            for (const before of [false, true]) {
                const c = await browser.newPage({ viewport: { width, height: 900 } });
                await visit(c, wordmark);
                await c.evaluate(() => document.fonts.ready);
                const m = await c.evaluate(async (before) => {
                    const word = document.querySelector('[data-oca-wordmark]');
                    // Before Inter loads on a machine with no Arial, Liberation or Arimo: the display
                    // stack as the page sets it, less Inter and less the Arial-sourced fallback.
                    let faces = [];
                    if (before) {
                        const stack = getComputedStyle(document.documentElement).getPropertyValue('--oc-font-display');
                        word.style.fontFamily = stack
                            .split(',')
                            .filter((f) => !["'OCA Inter'", "'OCA Inter Display Fallback'"].includes(f.trim()))
                            .join(',');
                        // A face whose local() font this machine lacks rejects; the rest settle loaded.
                        const ws = getComputedStyle(word);
                        await document.fonts.load(`${ws.fontWeight} ${ws.fontSize} ${ws.fontFamily}`, word.textContent).catch(() => null);
                        faces = [...document.fonts].filter((f) => /Display Fallback \w/.test(f.family) && f.status === 'loaded').map((f) => f.family.replace(/["']/g, ''));
                    }
                    const clip = word.parentElement.getBoundingClientRect();
                    const frameEl = word.parentElement.parentElement;
                    const fs = getComputedStyle(frameEl);
                    const fr = frameEl.getBoundingClientRect();
                    const content = { left: fr.left + parseFloat(fs.paddingLeft), right: fr.right - parseFloat(fs.paddingRight) };
                    // A glyph's ink, not its line box: the canvas measures the font's own outlines,
                    // placed on the baseline the text node sits on.
                    const ws = getComputedStyle(word);
                    const pen = document.createElement('canvas').getContext('2d');
                    pen.font = `${ws.fontWeight} ${ws.fontSize} ${ws.fontFamily}`;
                    const letters = [...word.children].map((span) => {
                        const r = document.createRange();
                        r.selectNodeContents(span);
                        const area = r.getBoundingClientRect();
                        const box = span.getBoundingClientRect();
                        const t = pen.measureText(span.textContent);
                        const baseline = area.top + t.fontBoundingBoxAscent;
                        return {
                            ch: span.textContent,
                            box: { left: box.left, right: box.right },
                            ink: { left: area.left - t.actualBoundingBoxLeft, right: area.left + t.actualBoundingBoxRight, top: baseline - t.actualBoundingBoxAscent, bottom: baseline + t.actualBoundingBoxDescent },
                        };
                    });
                    const gaps = letters.slice(1).map((l, i) => l.box.left - letters[i].box.right);
                    return { size: parseFloat(getComputedStyle(word).fontSize), clip: { left: clip.left, right: clip.right, top: clip.top, bottom: clip.bottom }, content, letters, gaps, text: letters.map((l) => l.ch).join(''), font: getComputedStyle(word).fontFamily.split(',')[0], faces };
                }, before);
                // With none of the Noto, DejaVu or Ubuntu faces here (a CI runner), the word falls to an
                // unadjusted system face, which says nothing about the faces this check is for.
                if (before && m.faces.length === 0) {
                    console.log(`  · layout: [${width}] no Noto, DejaVu or Ubuntu on this machine; the wordmark's non-Arial fallbacks are not measured here`);
                    await c.close();
                    continue;
                }
                const sorted = [...m.gaps].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                // At its natural spacing a letter's box meets the next (the tracking is inside the box),
                // so any gap is spreading: a word-sized one, or the same gap everywhere.
                const wide = m.gaps.map((g, i) => [g, i]).filter(([g]) => g > 0.05 * m.size || g - median > 0.05 * m.size);
                check(m.text === 'orangecheck', `[${width}${before ? ' before Inter, no Arial' : ''}] the wordmark reads "${m.text}"`);
                check(wide.length === 0, `[${width}${before ? ' before Inter, no Arial' : ''}] the wordmark's letters are spread: gaps ${wide.map(([g, i]) => `${m.text[i]}|${m.text[i + 1]} ${g.toFixed(1)}px`).join(', ')} against a median of ${median.toFixed(1)}px`);
                const clipped = m.letters.filter((l) => l.ink.left < m.clip.left - 0.5 || l.ink.right > m.clip.right + 0.5 || l.ink.top < m.clip.top - 0.5 || l.ink.bottom > m.clip.bottom + 0.5);
                check(clipped.length === 0, `[${width}${before ? ' before Inter, no Arial' : ''}] the wordmark's clip cuts ${clipped.map((l) => l.ch).join('')}`);
                const first = m.letters[0].ink.left;
                const last = m.letters.at(-1).ink.right;
                check(first >= m.content.left - 0.5 && last <= m.content.right + 0.5, `[${width}${before ? ' before Inter, no Arial' : ''}] the wordmark runs outside the frame: ${first.toFixed(1)}-${last.toFixed(1)} in ${m.content.left.toFixed(1)}-${m.content.right.toFixed(1)}`);
                // A fallback only has to fit; its size-adjust errs narrow.
                if (!before) check(last - first > 0.95 * (m.content.right - m.content.left), `[${width}${before ? ' before Inter, no Arial' : ''}] the wordmark fills ${(((last - first) / (m.content.right - m.content.left)) * 100).toFixed(0)}% of the frame, not its width`);
                await c.close();
            }
        }
        // An isMobile page widens its layout viewport to its content, so the window's inner width grows with
        // the overflow and a sideways measure against it reads 0: ochk.app's home hid a 68px scroll at 320 that
        // way. Every gate here measures against documentElement.clientWidth, and none may go back.
        {
            const wide = page('wider-than-phone', '<div style="width: 400px; height: 20px"></div>');
            const c = await browser.newPage({ viewport: { width: 320, height: 600 }, isMobile: true, hasTouch: true });
            await visit(c, wide);
            const m = await c.evaluate(() => ({ window: document.documentElement.scrollWidth - window['inner' + 'Width'], client: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
            check(m.client === 80, `[320 isMobile] a 400px child scrolls the page ${m.client}px by clientWidth, not 80 (the window's inner width reads ${m.window})`);
            await c.close();
            const word = new RegExp('\\binner' + 'Width\\b');
            const gates = readdirSync(join(pkg, 'scripts')).filter((f) => f.endsWith('.mjs') && word.test(readFileSync(join(pkg, 'scripts', f), 'utf8')));
            check(gates.length === 0, `a gate measures against the window's inner width, which an isMobile page widens with its own overflow: ${gates.join(', ')}`);
        }
        // Reflow (WCAG 1.4.10): no glow and no long word scrolls the page sideways, at 320 or any width
        // the frame fills or leaves.
        for (const w of [320, 390, 768, 900, 1024, 1200, 1280, 1440]) {
            const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768 });
            for (const [name, url] of [...reflowPages, ['a legal page with a long hostname', legalLong]]) {
                await visit(c, url);
                await c.evaluate(() => document.fonts.ready);
                await c.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
                const over = await c.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                check(over === 0, `[${w}] ${name} scrolls the page ${over}px sideways`);
            }
            if (w === 320) {
                // The mark is whole: its glow may be cut at the Frame's edge, where the section clips sideways, the mark never.
                await visit(c, reflowPages.find(([n]) => n === 'IsoCheck in a framed section in a PageFrame')[1]);
                const mark = await c.evaluate(() => {
                    const frame = document.querySelector('section > *');
                    const f = frame.getBoundingClientRect();
                    const b = document.querySelector('section svg').getBoundingClientRect();
                    return { clip: getComputedStyle(frame).overflowX, left: b.left, right: b.right, edgeL: f.left + frame.clientLeft, edgeR: f.left + frame.clientLeft + frame.clientWidth };
                });
                check(mark.clip === 'clip' && mark.left >= mark.edgeL - 0.5 && mark.right <= mark.edgeR + 0.5, `[320] IsoCheck's mark is cut where its section clips: ${JSON.stringify(mark)}`);
            }
            await c.close();
        }
        // AppShell's phone bar keeps every control whole and in order down to 320: the menu button stays 44x44,
        // nothing runs off the bar or under its neighbour, and the product word gives the room (it ends in an
        // ellipsis inside the home link rather than running out of it).
        for (const w of [320, 360, 390]) {
            const c = await browser.newPage({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
            await visit(c, appBars);
            await c.evaluate(() => document.fonts.ready);
            const bars = await c.evaluate(() =>
                [...document.querySelectorAll('[data-bar]')].map((d) => {
                    const row = d.querySelector('header > div');
                    const kids = [...row.children].map((k) => k.getBoundingClientRect());
                    const menu = row.querySelector('button[aria-label="Open navigation"]').getBoundingClientRect();
                    const home = row.querySelector('a[href="/"]');
                    const word = [...home.querySelectorAll('span')].find((s) => s.textContent === d.dataset.bar);
                    return {
                        bar: `${d.dataset.bar}, signed ${d.dataset.state}`,
                        menu: [Math.round(menu.width), Math.round(menu.height)],
                        over: row.scrollWidth - row.clientWidth,
                        right: Math.max(...kids.map((k) => k.right)) - document.documentElement.clientWidth,
                        overlap: Math.max(...kids.slice(1).map((k, i) => kids[i].right - k.left)),
                        wordOut: word.getBoundingClientRect().right - home.getBoundingClientRect().right,
                        homeWidth: Math.round(home.getBoundingClientRect().width),
                    };
                })
            );
            for (const b of bars) {
                check(b.menu[0] >= 44 && b.menu[1] >= 44, `[${w}] AppShell (${b.bar}): the menu button is ${b.menu.join('x')}, not 44x44`);
                check(b.over <= 1 && b.right <= 1 && b.overlap <= 0.5 && b.wordOut <= 0.5 && b.homeWidth >= 44, `[${w}] AppShell (${b.bar}): the bar overflows or a part runs under the next: ${JSON.stringify(b)}`);
            }
            await c.close();
        }
        // A link that is one identifier breaks inside DocsShell's article (five docs.ochk.io READMEs scrolled 6 to 79px
        // sideways at 320 to 390); a fence keeps its line whole and scrolls, and a table scrolls rather than break a name.
        for (const w of [320, 360, 390]) {
            const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true });
            await visit(c, docsLong);
            await c.evaluate(() => document.fonts.ready);
            const d = await c.evaluate(() => {
                const art = document.querySelector('#docs-content');
                const right = art.getBoundingClientRect().right;
                const scrolls = (el) => {
                    for (let x = el; x && x !== art; x = x.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(x).overflowX) && x.scrollWidth > x.clientWidth + 1) return true;
                    return false;
                };
                return {
                    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    past: Math.max(...[...art.querySelectorAll('li a')].map((a) => a.getBoundingClientRect().right - right)),
                    fence: scrolls(art.querySelector('pre')),
                    table: scrolls(art.querySelector('table')),
                };
            });
            check(d.over === 0 && d.past <= 0.5, `[${w}] DocsShell: a link that is one identifier runs ${d.past.toFixed(1)}px past the article and scrolls the page ${d.over}px sideways`);
            check(d.fence && d.table, `[${w}] DocsShell: a long line breaks instead of scrolling sideways (fence scrolls ${d.fence}, table scrolls ${d.table})`);
            await c.close();
        }
        // The same targets to a thumb (44 from 21.5px out each way, on the box or by a ::before) and to a mouse
        // (their drawn size): ProtocolNav's names, the search button, Show all, the docs bar's sections button
        // and the legal page's "On this page".
        {
            const read = async (url, w, touch, sel) => {
                const c = await browser.newPage({ viewport: { width: w, height: 900 }, isMobile: touch, hasTouch: touch });
                await visit(c, url);
                const r = await c.evaluate((q) =>
                    [...document.querySelectorAll(q)]
                        .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 1)
                        .map((el) => {
                            el.scrollIntoView({ block: 'center' });
                            const b = el.getBoundingClientRect();
                            const cx = b.left + b.width / 2;
                            const cy = b.top + b.height / 2;
                            const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                            return { name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), w: Math.round(b.width), h: Math.round(b.height), reach: [[0, -21.5], [0, 21.5], [-21.5, 0], [21.5, 0]].every(([dx, dy]) => lands(cx + dx, cy + dy)) };
                        }),
                    sel
                );
                await c.close();
                return r;
            };
            const shapes = [
                ['ProtocolNav', touchMore, 'nav[aria-label="Protocols"] a', 6, (x) => x.name === 'lock' && x.w < 44],
                ['the search button', touchMore, '[data-t="search"] button', 1, (x) => x.w === 40 && x.h === 40],
                ['Show all', touchMore, 'figure button[aria-expanded]', 1, (x) => x.h < 44],
                ["the docs bar's sections button", docsRail, '[data-oca-sticky="docs-bar"] button', 1, (x) => x.h === 40],
                ['On this page', legalLong, 'details > summary', 1, (x) => x.h < 44],
            ];
            for (const [name, url, sel, n, drawn] of shapes) {
                const t = await read(url, 390, true, sel);
                check(t.length >= n && t.every((x) => x.reach), `[390 touch] ${name}: ${t.filter((x) => !x.reach).length} of ${t.length} not a 44px target: ${JSON.stringify(t.filter((x) => !x.reach).slice(0, 3))}`);
                const m = await read(url, 390, false, sel);
                check(m.length >= n && m.some(drawn), `[390 mouse] ${name} is drawn ${m.map((x) => `${x.name} ${x.w}x${x.h}`).slice(0, 3).join(', ')}: a fine pointer keeps its drawn size`);
            }
        }
        // The census: every link, button, trigger and toggle any story draws is a 44px target to a thumb on a phone
        // and a touch tablet, hit from 21.5px out in every direction, on its box or by a ::before. A link inside a line
        // of running text is exempt, as WCAG 2.5.8 exempts it; so is a text field, which is not a tap target.
        // At a phone's 390 and the narrowest phone's 320, and a tablet's 768, 900, 1024 and 1180, where the md, lg
        // and xl layouts meet a thumb. And with a mouse at a desk's 1440 and 1024, where WCAG 2.5.8 asks 24px: on
        // the box or a ::before, or an undersized target whose 24px circle meets no other target.
        // Doors (what opens behind a trigger) cost nearly all of a pass's time, 70 to 125s a page here against 5s without,
        // so they are opened at one phone (390), one tablet (1024) and the desk (1440 mouse); every door finding
        // in 2.0.1 and 2.0.2 showed at one of those. The other passes read the page, the plants and the held dialog.
        // A plant read in more than one pass: small in any is small; where it was first read is where it is.
        const addPlants = (r, got) => {
            for (const [k, v] of Object.entries(got.plants)) {
                r.plants[k] = r.plants[k] === 'small' ? 'small' : v;
                r.at[k] ??= got.at[k];
            }
        };
        for (const [width, fine, doors] of [[390, false, true], [320, false, false], [768, false, false], [900, false, false], [1024, false, true], [1180, false, false], [1440, true, true], [1024, true, false]]) for (const [url, least] of [[census, 100], [`${census}#modal`, 1]]) {
            const c = await browser.newPage(fine ? { viewport: { width, height: 900 } } : { viewport: { width, height: 900 }, isMobile: true, hasTouch: true });
            const to = fine ? `${width} mouse` : `${width} touch`;
            await c.emulateMedia({ reducedMotion: 'reduce' });
            // Loaded, not visited: a story's own sample markup is not held to the package's text and state rules.
            visited.add(url);
            await c.goto(url);
            const drawn = await c.waitForFunction((n) => document.querySelectorAll('[data-story]').length >= n, least, { timeout: 20000 }).then(() => true, () => false);
            await c.evaluate(() => new Promise((r) => setTimeout(r, 800)));
            // The measure stays on the page, so what opens behind a trigger below is read the same way.
            await c.evaluate((fine) => {
                // A thumb's 44px, a mouse's 24: hit from half that, less half a pixel, out from the centre.
                const R = fine ? 11.5 : 21.5;
                document.documentElement.style.scrollBehavior = 'auto';
                const SEL = 'a[href], button, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="link"], [role="option"], input[type="checkbox"], input[type="radio"]';
                // A control that picks a value (a select, radio, tab, checkbox, switch or pressed toggle) carries its data-ui
                // mark, so a census of a site tells the package's apart from one drawn by hand.
                window.__unmarked = () =>
                    [...document.querySelectorAll('[role="combobox"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], [aria-pressed]')]
                        .filter((el) => !el.hasAttribute('data-ui') && el.getClientRects().length && el.checkVisibility({ visibilityProperty: true }))
                        .map((el) => `${el.closest('[data-story]')?.dataset.story ?? 'outside a story (a portal)'}: ${el.tagName.toLowerCase()}[${el.getAttribute('role') ?? 'aria-pressed'}] "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`);
                window.__censusPage = () => ({ stories: document.querySelectorAll('[data-story]').length, failed: [...document.querySelectorAll('[data-story-failed]')].map((e) => `${e.closest('[data-story]')?.dataset.story} (${e.dataset.storyFailed})`), dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].map((d) => `${d.closest('[data-story]')?.dataset.story ?? 'portal'}: ${d.getAttribute('aria-label') ?? ''} ${d.textContent.trim().slice(0, 60)}`), hidden: document.querySelectorAll('[data-story][aria-hidden="true"], [data-story] [aria-hidden="true"] [data-story]').length + document.querySelectorAll('body > [aria-hidden="true"]').length });
                // A link inside a sentence, as WCAG 2.5.8 exempts it: an inline link (never a button, a checkbox or a
                // radio) whose own line holds words of its block outside any target. Read from the link's line boxes
                // against the rects of the block's other text, not from a word count.
                const blockOf = (n) => {
                    let b = n.parentElement;
                    while (b && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
                    return b;
                };
                const inText = (el) => {
                    if (!el.matches('a[href], [role="link"]') || !getComputedStyle(el).display.startsWith('inline')) return false;
                    const block = blockOf(el);
                    const lines = [...el.getClientRects()];
                    // The sentence's own punctuation touching the link counts as its words ("… at hello@ochk.io."), a
                    // separator between links ("Docs · Status") does not.
                    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
                    walk.currentNode = el;
                    let after = walk.nextNode();
                    while (after && el.contains(after)) after = walk.nextNode();
                    walk.currentNode = block;
                    const range = document.createRange();
                    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
                        const words = /[\p{L}\p{N}]/u.test(t.data) || (t === after && /^[.,;:!?)\]…”’]/.test(t.data));
                        if (!words || el.contains(t) || t.parentElement.closest(SEL) || blockOf(t) !== block) continue;
                        range.selectNodeContents(t);
                        for (const r of range.getClientRects()) {
                            if (r.width > 1 && lines.some((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > Math.min(l.height, r.height) / 2)) return true;
                        }
                    }
                    return false;
                };
                // `behind` names the trigger that was opened: then only what it showed is read, and each target once.
                // Each target read behind it is held, findings and all, until it shuts and __settle names what was not its.
                let held = 0;
                window.__census = (behind) => {
                const out = { seen: 0, inline: [], small: [], spaced: [], plants: {}, at: {}, held: [] };
                for (const el of document.querySelectorAll(SEL)) {
                    if (el.hasAttribute('data-census-read') || (behind && (el.dataset.censusBehind || el.hasAttribute('data-census-settled'))) || el.closest('[aria-hidden="true"], [inert], [data-story-failed]') || el.disabled) continue;
                    const box = el.getBoundingClientRect();
                    // checkVisibility skips a closed details' content too: it keeps its boxes but draws and takes nothing.
                    if (!el.getClientRects().length || box.width <= 1 || box.height <= 1 || !el.checkVisibility({ visibilityProperty: true })) continue;
                    el.setAttribute('data-census-read', '');
                    const rec = behind ? { id: ++held, seen: 0, inline: [], small: [], spaced: [], plants: {}, at: {} } : out;
                    if (behind) {
                        el.dataset.censusHeld = String(rec.id);
                        out.held.push(rec);
                    }
                    const where = behind ?? el.closest('[data-story]')?.dataset.story ?? 'outside a story (a portal)';
                    const plant = el.closest('[data-plant]')?.dataset.plant;
                    if (inText(el)) {
                        if (plant) {
                            rec.plants[plant] = 'exempt';
                            rec.at[plant] = where;
                        } else rec.inline.push(`${where}: "${el.textContent.trim().slice(0, 24)}"`);
                        continue;
                    }
                    // What a trigger shows in the page itself (a details' list, a sidebar's section) comes into view as the
                    // page's own targets do. An overlay, a fixed layer (a menu, a popover, a sheet), is placed beside its
                    // trigger and follows a scrolled page only a frame later: there the page stays put.
                    let layer = behind ? el : null;
                    while (layer && layer !== document.body && getComputedStyle(layer).position !== 'fixed') layer = layer.parentElement;
                    if (!layer || layer === document.body) {
                        el.style.scrollMargin = '32px';
                        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
                        el.style.scrollMargin = '';
                    } else {
                        // Only the overlay's own list scrolls.
                        let sc = el.parentElement;
                        while (sc && sc !== document.body && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
                        if (sc && sc !== document.body) {
                            const r0 = el.getBoundingClientRect();
                            const s0 = sc.getBoundingClientRect();
                            if (r0.top < s0.top + 32) sc.scrollTop -= s0.top + 32 - r0.top;
                            else if (r0.bottom > s0.bottom - 32) sc.scrollTop += r0.bottom - (s0.bottom - 32);
                        }
                        // A thumb's reach out of view: left for the page pass after the doors, which reads it if the page
                        // shows it on its own (a timed-out load's retry). What it does not find stays unread, by name.
                        const r1 = el.getBoundingClientRect();
                        const m1 = r1.top + r1.height / 2;
                        if (m1 < 22 || m1 > innerHeight - 22) {
                            el.removeAttribute('data-census-read');
                            el.dataset.censusBehind = `${where}: ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
                            continue;
                        }
                    }
                    if (!plant) rec.seen++;
                    const b = el.getBoundingClientRect();
                    const cx = b.left + b.width / 2;
                    const cy = b.top + b.height / 2;
                    // A radio's or a checkbox's label takes its taps too.
                    const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
                    const lands = (x, y) => {
                        const got = document.elementFromPoint(x, y);
                        return el.contains(got) || (!!label && label.contains(got));
                    };
                    // Two whole targets that meet edge to edge are both whole: a pointer R out may land on the neighbour
                    // only where the neighbour starts within a pixel of this one's edge (hit-testing rounds).
                    const meets = (got, dx, dy) => {
                        const n = got?.closest(SEL);
                        if (!n || n === el || n.contains(el) || el.contains(n)) return false;
                        const o = n.getBoundingClientRect();
                        if (dy > 0) return b.height >= 2 * R + 0.5 && Math.abs(o.top - b.bottom) <= 1;
                        if (dy < 0) return b.height >= 2 * R + 0.5 && Math.abs(b.top - o.bottom) <= 1;
                        if (dx > 0) return b.width >= 2 * R + 0.5 && Math.abs(o.left - b.right) <= 1;
                        return b.width >= 2 * R + 0.5 && Math.abs(b.left - o.right) <= 1;
                    };
                    const miss = [[0, -R], [0, R], [-R, 0], [R, 0]].find(([dx, dy]) => !lands(cx + dx, cy + dy) && !meets(document.elementFromPoint(cx + dx, cy + dy), dx, dy));
                    // To a mouse, WCAG 2.5.8's spacing: an undersized target is let off when a 24px circle on its centre
                    // meets no other target's box and no other undersized target's circle.
                    const spaced =
                        fine &&
                        !!miss &&
                        [...document.querySelectorAll(SEL)].every((n) => {
                            if (n === el || n.contains(el) || el.contains(n) || n.closest('[aria-hidden="true"], [inert]') || !n.checkVisibility({ visibilityProperty: true })) return true;
                            const o = n.getBoundingClientRect();
                            if (o.width <= 1 || o.height <= 1) return true;
                            if (Math.hypot(Math.max(o.left - cx, 0, cx - o.right), Math.max(o.top - cy, 0, cy - o.bottom)) < 12) return false;
                            return !(o.width < 24 || o.height < 24) || Math.hypot(o.left + o.width / 2 - cx, o.top + o.height / 2 - cy) >= 24;
                        });
                    if (plant) {
                        const v = !miss ? 'whole' : spaced ? 'spaced' : 'small';
                        rec.plants[plant] = rec.plants[plant] === 'small' ? 'small' : v;
                        rec.at[plant] ??= where;
                        continue;
                    }
                    if (spaced) {
                        rec.spaced.push(`${where}: ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
                        continue;
                    }
                    if (miss) {
                        const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28);
                        // What a thumb there lands on instead: a neighbour, or the ground.
                        const got = document.elementFromPoint(cx + miss[0], cy + miss[1]);
                        const on = got ? `${got.tagName.toLowerCase()}${got.getAttribute('aria-label') ? ' "' + got.getAttribute('aria-label').slice(0, 20) + '"' : got.textContent?.trim() ? ' "' + got.textContent.trim().slice(0, 16) + '"' : ''}` : 'nothing';
                        rec.small.push(`${where}: ${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : ''} "${name}" ${Math.round(b.width)}x${Math.round(b.height)}, ${miss[0] ? (miss[0] < 0 ? 'left' : 'right') : miss[1] < 0 ? 'above' : 'below'} lands on ${on}`);
                    }
                }
                return out;
                };
                // The settle rule: a target still shown once its trigger has shut, outside a fixed layer, was not the
                // trigger's (a demo's last screen, in the trigger's own story or another). It is let go unread, and the page
                // pass reads it where it is. One in a fixed layer (an overlay on its way out) stays the trigger's.
                // What it lets go is remembered, so one gone again before the page pass is named, not lost.
                const letGo = [];
                window.__settle = () => {
                    const ids = [];
                    for (const el of document.querySelectorAll('[data-census-held]')) {
                        const id = Number(el.dataset.censusHeld);
                        el.removeAttribute('data-census-held');
                        const box = el.getBoundingClientRect();
                        if (!el.getClientRects().length || box.width <= 1 || box.height <= 1 || !el.checkVisibility({ visibilityProperty: true }) || el.closest('[aria-hidden="true"], [inert]')) continue;
                        let layer = el;
                        while (layer && layer !== document.body && getComputedStyle(layer).position !== 'fixed') layer = layer.parentElement;
                        if (layer && layer !== document.body) continue;
                        el.removeAttribute('data-census-read');
                        el.setAttribute('data-census-settled', '');
                        ids.push(id);
                        letGo.push({ el, plant: el.closest('[data-plant]')?.dataset.plant, name: `${el.closest('[data-story]')?.dataset.story ?? 'outside a story (a portal)'}: ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 28)}"` });
                    }
                    return ids;
                };
                // Let go and then read by no pass: gone from the page, or no longer shown, by the page pass after the doors.
                window.__letGoUnread = () => letGo.filter((g) => !g.el.isConnected || !g.el.hasAttribute('data-census-read')).map(({ plant, name }) => ({ plant, name }));
            }, fine);
            const r = { width, fine, ...(await c.evaluate(() => window.__censusPage())), ...(await c.evaluate(() => window.__census(null))), doors: 0, opened: 0, behind: 0, lost: [], unread: [], gone: [] };
            const unmarked = new Set(await c.evaluate(() => window.__unmarked()));
            // A story wider than the screen widens the page, and a phone then places fixed overlays off the screen.
            r.sideways = await c.evaluate((w) => [...document.querySelectorAll('[data-story], [data-plants]')].filter((s) => s.scrollWidth > w + 1).map((s) => `${s.dataset.story ?? 'plants'} (${s.scrollWidth})`), width);
            // Behind a trigger: each closed popover, menu, select, dialog or sheet, each collapsed control and each
            // closed details, opened one at a time as a thumb would, and what it shows read the same way.
            if (least > 1 && doors) {
                r.doors = await c.evaluate(() => {
                    const all = [...document.querySelectorAll('[data-story] :is([aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded="false"], details:not([open]) > summary)')].filter(
                        (el) => !el.disabled && !el.closest('[aria-hidden="true"], [inert]') && el.checkVisibility({ visibilityProperty: true })
                    );
                    all.forEach((el, i) => el.setAttribute('data-census-door', String(i)));
                    return all.length;
                });
                for (let i = 0; i < r.doors; i++) {
                    const door = c.locator(`[data-census-door="${i}"]`);
                    const name = await door.evaluate((el) => `behind ${el.closest('[data-story]')?.dataset.story} "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 24)}"`).catch(() => null);
                    if (!name) continue;
                    // The trigger mid-screen, so what it opens has room on either side.
                    await door.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })).catch(() => {});
                    // A loaded box draws a frame in seconds, and a click waits for the trigger to hold still.
                    if (!(await door.click({ timeout: 15000 }).then(() => true, () => false))) {
                        r.lost.push(name);
                        continue;
                    }
                    await c.evaluate(() => new Promise((res) => setTimeout(res, 300)));
                    await c.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
                    const got = await c.evaluate((n) => window.__census(n), name);
                    for (const u of await c.evaluate(() => window.__unmarked())) unmarked.add(u);
                    // Shut it again: Escape for an overlay, a second press for a toggle or a details.
                    await c.keyboard.press('Escape');
                    await c.evaluate(() => new Promise((res) => setTimeout(res, 150)));
                    const still = await door.evaluate((el) => el.getAttribute('aria-expanded') === 'true' || (el.tagName === 'SUMMARY' && el.parentElement.open)).catch(() => false);
                    if (still) await door.click({ timeout: 15000 }).catch(() => {});
                    await c.evaluate(() => new Promise((res) => setTimeout(res, 150)));
                    // What it showed is what went when it shut; the rest is the page's (the settle rule).
                    const settled = new Set(await c.evaluate(() => window.__settle()));
                    const kept = got.held.filter((h) => !settled.has(h.id));
                    if (kept.some((h) => h.seen + h.inline.length)) r.opened++;
                    for (const h of kept) {
                        r.behind += h.seen;
                        r.inline.push(...h.inline);
                        r.small.push(...h.small);
                        r.spaced.push(...h.spaced);
                        addPlants(r, h);
                    }
                }
                // The page once more: what showed during the doors on its own is read where it is, and a target that
                // only a trigger showed, out of view, is unread.
                const late = await c.evaluate(() => window.__census(null));
                r.seen += late.seen;
                r.inline.push(...late.inline);
                r.small.push(...late.small);
                r.spaced.push(...late.spaced);
                addPlants(r, late);
                r.unread = await c.evaluate(() => [...document.querySelectorAll('[data-census-behind]:not([data-census-read])')].map((e) => e.dataset.censusBehind));
                r.gone = await c.evaluate(() => window.__letGoUnread());
            }
            const tag = least > 1 ? 'the census' : 'the census of a held-open dialog';
            if (process.env.OCA_CENSUS_OUT) writeFileSync(`${process.env.OCA_CENSUS_OUT}${width === 390 && !fine ? '' : '.' + width}${fine ? '.mouse' : ''}${least > 1 ? '' : '.modal'}.json`, JSON.stringify(r, null, 1));
            check(drawn && r.stories >= least && r.failed.length === 0, `[${width}] ${tag} drew ${r.stories} stories, and these threw: ${r.failed.join(', ')}`);
            check(least > 1 ? r.dialogs.length === 0 && r.seen > 300 : r.dialogs.length === 1 && r.seen >= 3, `[${to}] ${tag} read only ${r.seen} targets, with dialogs open: ${JSON.stringify(r.dialogs)}`);
            if (least > 1 && doors) check(r.opened >= 15 && r.behind >= 40, `[${to}] the census opened ${r.opened} of ${r.doors} triggers and read ${r.behind} targets behind them`);
            check(r.lost.length === 0, `[${to}] the census could not open these triggers: ${r.lost.join(', ')}`);
            check(r.unread.length === 0, `[${to}] the census could not bring these targets behind a trigger into view: ${r.unread.slice(0, 12).join('; ')}`);
            const goneUnread = r.gone.filter((g) => !g.plant).map((g) => g.name);
            check(goneUnread.length === 0, `[${to}] these targets showed by themselves behind a trigger and were gone by the page pass, so no pass read them: ${goneUnread.slice(0, 12).join('; ')}`);
            check(r.sideways.length === 0, `[${width}] these stories are wider than the screen: ${r.sideways.join(', ')}`);
            check(unmarked.size === 0, `[${to}] ${tag} found controls that pick a value with no data-ui mark: ${[...unmarked].slice(0, 12).join('; ')}`);
            // The plants prove the measure: what is small is found, only a link in a sentence is let off, and to a mouse
            // an undersized target alone is let off by its spacing while two crowded ones are not.
            const want = fine
                ? { 'card-title': 'whole', 'checkbox-li': 'spaced', 'icon-button-li': 'spaced', 'sentence-link': 'exempt', 'crowded-icons': 'small', 'lone-icon': 'spaced' }
                : { 'card-title': 'small', 'checkbox-li': 'small', 'icon-button-li': 'small', 'sentence-link': 'exempt', 'crowded-icons': 'small', 'lone-icon': 'small' };
            if (least > 1) check(Object.entries(want).every(([k, v]) => r.plants[k] === v), `[${to}] the census's plants read ${JSON.stringify(r.plants)}, not ${JSON.stringify(want)}`);
            // Behind a trigger, what it shows is its own, its layer on the way out too; a link that shows by itself
            // meanwhile and stays, in its own story or another, is the page's, read whole once the layer over it has gone.
            if (least > 1 && doors) {
                const settle = { 'door-content': 'behind plant/door-own ', 'door-cover': 'behind plant/door-other ', 'door-inline': 'behind plant/door-inline ', 'door-hidden': 'behind plant/door-hidden ', 'door-inert': 'behind plant/door-inert ', 'late-own': 'plant/door-own', 'late-other': 'plant/late-other' };
                const off = Object.entries(settle).filter(([k, at]) => r.plants[k] !== 'whole' || !(r.at[k] === at || r.at[k]?.startsWith(at)));
                check(off.length === 0, `[${to}] the census's trigger plants read ${off.map(([k]) => `${k} ${r.plants[k]} at ${r.at[k]}`).join(', ')}: each whole, a trigger's own behind it and a link shown by itself at its story`);
                check(!('late-gone' in r.plants), `[${to}] the census read late-gone ${r.plants['late-gone']} at ${r.at['late-gone']}: let go when its first trigger shut, it is no later trigger's`);
                // Gone before the page pass, it is named as read by no pass, so a real target like it fails above.
                const gonePlants = r.gone.filter((g) => g.plant).map((g) => g.plant);
                check(JSON.stringify(gonePlants) === '["late-gone"]', `[${to}] the census names ${JSON.stringify(gonePlants)} as let go and read by no pass, not late-gone alone`);
            }
            check(r.small.length === 0, `[${to}] ${tag} found ${r.small.length} targets under ${fine ? '24px to a mouse' : '44px to a thumb'}: ${r.small.slice(0, 12).join('; ')}`);
            await c.close();
        }
        // Every scroller that takes focus is a named region: each ScrollFade user, scrolling in a narrow box.
        {
            const c = await browser.newPage({ viewport: { width: 700, height: 2400 } });
            await visit(c, scrollNames);
            const ready = await c.waitForFunction(() => document.querySelectorAll('[data-box] [tabindex="0"]').length >= 11 && document.querySelector('[data-box="diagram"] svg'), null, { timeout: 10000 }).then(() => true, () => false);
            await c.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const got = await c.evaluate(() =>
                [...document.querySelectorAll('[data-box]')].map((b) => {
                    const s = [...b.querySelectorAll('[tabindex="0"]')].find((el) => getComputedStyle(el).overflowX === 'auto');
                    return [b.dataset.box, s ? { role: s.getAttribute('role'), name: s.getAttribute('aria-label') } : null];
                })
            );
            const want = { unnamed: null, mdx: 'Parameters', api: 'Options', diagram: 'A flow', tabs: 'Desk', 'tabs-bare': 'Tabs', protocols: 'Protocols', codetabs: 'Versions', code: 'A long line', 'hash-text': 'Fees', sectioned: null };
            const off = got.filter(([k, s]) => !s || s.role !== (want[k] === null ? null : 'region') || s.name !== want[k]);
            check(ready && got.length === 11 && off.length === 0, `[700] a ScrollFade that scrolls takes focus with no region name, or not the one it should have: ${JSON.stringify(off)}`);
            await c.close();
        }
        // ParticlePortrait as wide as its stage, with a mouse: at 1024 its labels have no room beside the square, so they
        // list under it and the page does not scroll sideways; at 1440 they keep their place beside it.
        for (const [w, beside] of [[1024, false], [1440, true]]) {
            const c = await browser.newPage({ viewport: { width: w, height: 900 } });
            await visit(c, portraitPage);
            await c.waitForSelector('.oca-portrait-legend', { state: 'attached' });
            await c.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const got = await c.evaluate(() => ({ wide: document.documentElement.scrollWidth, listed: getComputedStyle(document.querySelector('.oca-portrait-legend')).display !== 'none' }));
            check(got.wide <= w && got.listed !== beside, `[${w} mouse] a ParticlePortrait as wide as its stage ${got.listed ? 'lists' : 'labels'} its notes, and the page is ${got.wide}px wide`);
            await c.close();
        }
        // The same portrait at 1440, its figure narrowed to 1024 by script and widened again with the window untouched,
        // still past the 46rem query: the labels list and come back, and the page never scrolls sideways.
        {
            const c = await browser.newPage({ viewport: { width: 1440, height: 900 } });
            await visit(c, portraitPage);
            await c.waitForSelector('.oca-portrait-legend', { state: 'attached' });
            const frames = () => c.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
            const read = () => c.evaluate(() => ({ wide: document.documentElement.scrollWidth, listed: getComputedStyle(document.querySelector('.oca-portrait-legend')).display !== 'none' }));
            const steps = [];
            for (const width of ['', '1024px', '']) {
                await c.evaluate((wd) => (document.querySelector('.oca-portrait').style.width = wd), width);
                await frames();
                steps.push(await read());
            }
            check(steps.map((s) => s.listed).join() === 'false,true,false' && steps.every((s) => s.wide <= 1440), `[1440 mouse] a ParticlePortrait narrowed to 1024 and widened again, the window untouched, reads ${JSON.stringify(steps)}: its labels list, then come back`);
            await c.close();
        }
        // A sheet's Close (a site's phone menu) and a dialog's: 44 square to a thumb, 36 to a mouse.
        for (const [name, url, open] of [
            ["the phone menu's Close", toolMenu, 'header button[aria-label="Open menu"]'],
            ["a dialog's Close", dialogClose, null],
        ]) {
            for (const touch of [true, false]) {
                const c = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: touch, hasTouch: touch });
                await visit(c, url);
                if (open) await c.click(open);
                await c.waitForSelector('[role="dialog"] button[aria-label="Close"]');
                await c.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
                const x = await c.evaluate(() => {
                    const el = document.querySelector('[role="dialog"] button[aria-label="Close"]');
                    const b = el.getBoundingClientRect();
                    const cx = b.left + b.width / 2;
                    const cy = b.top + b.height / 2;
                    const lands = (px, py) => el.contains(document.elementFromPoint(px, py));
                    return { w: Math.round(b.width), h: Math.round(b.height), reach: [[0, -21.5], [0, 21.5], [-21.5, 0], [21.5, 0]].every(([dx, dy]) => lands(cx + dx, cy + dy)) };
                });
                if (touch) check(x.reach, `[390 touch] ${name} is ${x.w}x${x.h}, not a 44px target`);
                else check(x.w === 36 && x.h === 36, `[390 mouse] ${name} is drawn ${x.w}x${x.h}, not its 36x36`);
                await c.close();
            }
        }
        // A code block that scrolls is a tab stop, so its region has a name: the caption, or the tab's label.
        {
            const c = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
            await visit(c, codeRegion);
            const drawn = await c.waitForFunction(() => document.querySelectorAll('pre').length >= 2, null, { timeout: 10000 }).then(() => true, () => false);
            check(drawn, '[390] the code region page did not render its two code blocks');
            await c.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const regions = await c.evaluate(() =>
                [...document.querySelectorAll('figure pre, [role="tabpanel"] pre')]
                    .map((pre) => pre.closest('[tabindex]'))
                    .filter((el) => el && el.tabIndex === 0)
                    .map((el) => ({ role: el.getAttribute('role'), name: el.getAttribute('aria-label') }))
            );
            check(regions.length === 2 && regions.every((r) => r.role === 'region' && r.name), `[390] a code block that scrolls is a tab stop with no region name: ${JSON.stringify(regions)}`);
            check(regions.map((r) => r.name).join('|') === 'A long line|curl', `[390] the code regions are named ${JSON.stringify(regions.map((r) => r.name))}, not by the caption and the tab's label`);
            await c.close();
        }
        check(small.size === 0, `text under 12px: ${[...small.keys()].slice(0, 8).join('; ')}`);
        check(weak.size === 0, `states drawn as a fill with no edge at 3:1: ${[...weak.keys()].slice(0, 8).join('; ')}`);
        const unvisited = [...written].filter((u) => !visited.has(u));
        check(unvisited.length === 0, `pages written but never loaded through visit: ${unvisited.map((u) => u.split('/').pop()).join(', ')}`);
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} layout failure(s)`);
    process.exit(1);
}
console.log(`✓ layout: ${checks} checks in Chrome at 390 and 1440; panel actions, an expanded body, the app frames, one column, 44px targets, menus and rows, markdown tables, bare borders, 1.9.0's parts, the folded footer, touch targets, wrapped rows, a failed read, a hero's first frame and its actions, a docs link that is one long name`);
