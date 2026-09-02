/**
 * Audit the vertical rhythm of live family pages.
 *
 * Why measure at all: the /signin defect (an OAuth button sitting 0px under
 * PageHeader's `border-b`) passed type-check, lint, tests and a READY deploy,
 * and was invisible in a screenshot glance. It was obvious the instant it was
 * measured. This turns that class of defect into a number.
 *
 * Why measure TEXT and not boxes: the family's layout stacks full-bleed
 * `border-b` bands edge to edge on purpose, so consecutive section BOXES
 * legitimately sit 0px apart while their text is 80px clear of the rule.
 * Two earlier revisions of this script flagged those as defects and buried
 * the real one. The only measure that matches what a human sees is the
 * distance from a section rule to the first rendered TEXT beneath it, taken
 * with a Range over the text node — not the box, not the box's padding.
 *
 * Why only headings and controls: a table footnote 13px under its table
 * (vault) and a live status strip 9px under the hero (globe, the family
 * .oc-substrip pattern) are CORRECT — captions and status strips are meant
 * to hug the thing they annotate. Flagging those trains you to ignore the
 * tool. What actually read as broken on /signin was an interactive control
 * jammed against a rule, so that is what this flags: the first text beneath
 * the rule must be a heading or sit inside a link/button/input.
 *
 * Flags:
 *   TIGHT  <16px between a rule and a following heading or control
 *   TALL   >200px, usually a section that lost its own padding contract
 *
 * Usage: node scripts/audit-vertical-rhythm.mjs <url> [url...]
 */
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
if (urls.length === 0) {
    console.error('usage: node scripts/audit-vertical-rhythm.mjs <url> [url...]');
    process.exit(2);
}

const MIN_CLEAR = 16;
const MAX_CLEAR = 200;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
let findings = 0;

for (const url of urls) {
    let rows;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(1200);
        rows = await page.evaluate(() => {
            const textRect = (root, last = false) => {
                const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let found = null;
                while (w.nextNode()) {
                    const t = w.currentNode;
                    if (!(t.textContent || '').trim()) continue;
                    const r = document.createRange();
                    r.selectNodeContents(t);
                    const rect = r.getBoundingClientRect();
                    if (rect.height <= 0) continue;
                    const owner = t.parentElement;
                    const heading = owner?.closest('h1,h2,h3,h4,h5,h6');
                    const control = owner?.closest(
                        'a,button,input,select,textarea,[role="button"],[role="tab"]'
                    );
                    found = {
                        top: rect.top,
                        bottom: rect.bottom,
                        text: t.textContent.trim().slice(0, 30),
                        kind: heading ? 'heading' : control ? 'control' : 'prose',
                    };
                    if (!last) return found;
                }
                return found;
            };
            const out = [];
            for (const container of document.querySelectorAll('.container, main')) {
                const kids = [...container.children].filter((el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    return r.height > 0 && cs.display !== 'none' && cs.position !== 'fixed';
                });
                for (let i = 0; i < kids.length - 1; i++) {
                    const a = kids[i];
                    const b = kids[i + 1];
                    const ra = a.getBoundingClientRect();
                    const csa = getComputedStyle(a);
                    const hasRule =
                        parseFloat(csa.borderBottomWidth) > 0 && csa.borderBottomStyle !== 'none';
                    if (!hasRule) continue;
                    const next = textRect(b);
                    if (!next) continue;
                    out.push({
                        clear: Math.round(next.top - ra.bottom),
                        text: next.text,
                        kind: next.kind,
                        a: (a.className || '').toString().split(' ').slice(0, 3).join(' ').slice(0, 40),
                    });
                }
            }
            return out;
        });
    } catch (e) {
        console.log(`\n${url}\n  ! ${e.message.split('\n')[0]}`);
        continue;
    }

    const flagged = rows.filter(
        (r) => (r.clear < MIN_CLEAR && r.kind !== 'prose') || r.clear > MAX_CLEAR
    );
    const clears = rows.map((r) => r.clear).sort((x, y) => x - y);
    const range = clears.length ? `${clears[0]}–${clears[clears.length - 1]}px` : 'n/a';
    console.log(`\n${url}  (${rows.length} rules, clearance ${range})`);
    if (flagged.length === 0) {
        console.log('  ok');
        continue;
    }
    for (const f of flagged) {
        console.log(
            `  ${f.clear < MIN_CLEAR ? 'TIGHT' : 'TALL '} ${String(f.clear).padStart(4)}px  after [${f.a}]  ->  ${f.kind} "${f.text}"`
        );
        findings++;
    }
}

console.log(`\n${findings} finding(s)\n`);
await browser.close();
process.exitCode = findings > 0 ? 1 : 0;
