// mdx-transform.mjs on TypeDoc-shaped bodies: a JSDoc example written indented under its prose
// becomes a fenced block; lists, list paragraphs and code already fenced stay as they are.
//
//   node --test scripts/mdx-transform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fenceIndentedCode, mdxTransform } from './mdx-transform.mjs';

const page = (body) => `---\ntitle: x\n---\n\n${body}`;

test('an indented example under prose becomes one fenced block, dedented, its braces kept', () => {
    const body = [
        '# Function: checkSignInRule()',
        '',
        'It also throws on a missing rule.',
        '',
        "  const session = await verifyOcToken(token, { audience: 'https://your-site.example' });",
        '  if (!session) return res.status(401).json({ ok: false });',
        '',
        'Prose { after } it.',
        '',
    ].join('\n');
    const out = mdxTransform(page(body));
    assert.match(
        out,
        /\n```\nconst session = await verifyOcToken\(token, \{ audience: 'https:\/\/your-site\.example' \}\);\nif \(!session\) return res\.status\(401\)\.json\(\{ ok: false \}\);\n```\n/
    );
    assert.match(out, /Prose &#123; after &#125; it\./);
});

test('indented paragraphs split by blank lines are one block, the blank lines kept', () => {
    const out = fenceIndentedCode(['Example:', '', '  import { a } from "b";', '', '  a();', '', 'Done.'].join('\n'));
    assert.equal(out, ['Example:', '', '```', 'import { a } from "b";', '', 'a();', '```', '', 'Done.'].join('\n'));
});

test('relative indentation inside the block survives the dedent', () => {
    const out = fenceIndentedCode(['Use:', '', '  app.get(x, () => {', '    return 1;', '  });'].join('\n'));
    assert.equal(out, ['Use:', '', '```', 'app.get(x, () => {', '  return 1;', '});', '```'].join('\n'));
});

test('a box-drawn layout is set as a block, so its lines do not wrap or overflow as text', () => {
    const out = fenceIndentedCode(['Layout (desktop):', '', '  ┌─────┬─────┐', '  │ a   │ b   │', '  └─────┴─────┘'].join('\n'));
    assert.equal(out, ['Layout (desktop):', '', '```', '┌─────┬─────┐', '│ a   │ b   │', '└─────┴─────┘', '```'].join('\n'));
});

test('an indented list stays a list', () => {
    const body = ['Options:', '', '  - first', '  - second', '', 'End.'].join('\n');
    assert.equal(fenceIndentedCode(body), body);
});

test("a list item's own indented paragraph stays in the list", () => {
    const body = ['- item one', '', '  more about item one', '', '1. numbered', '', '   its paragraph'].join('\n');
    assert.equal(fenceIndentedCode(body), body);
});

test('an indented line that runs straight into prose is not a block', () => {
    const body = ['Intro.', '', '  indented start', 'and plain text after it', '', 'End.'].join('\n');
    assert.equal(fenceIndentedCode(body), body);
});

test('code already fenced is left alone, and a second pass changes nothing', () => {
    const body = ['```ts', '  const x = 1;', '```', '', 'Then:', '', '  y();'].join('\n');
    const once = fenceIndentedCode(body);
    assert.equal(once, ['```ts', '  const x = 1;', '```', '', 'Then:', '', '```', 'y();', '```'].join('\n'));
    assert.equal(fenceIndentedCode(once), once);
});

test("TypeDoc's multi-line union type stays text, so its links still work", () => {
    const body = ['## Returns', '', '  \\| [`Utxo`](../interfaces/Utxo)[]', '  \\| `null`', ''].join('\n');
    assert.equal(fenceIndentedCode(body), body);
});
