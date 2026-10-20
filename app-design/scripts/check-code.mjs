#!/usr/bin/env node
/*
 * The highlighter, the fence meta and the rehype plugin, run on the built
 * ./code entry. Highlighting must never change the code (every token joined
 * back is the source), must name the kinds the palette colours, and every
 * kind must have its colour in styles/code.css. Run after `yarn build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist/code.js');
if (!existsSync(dist)) {
    console.error('✗ code: dist/code.js is missing; run yarn build first');
    process.exit(1);
}
const { highlight, readDiff, parseCodeMeta, parseLineRanges, linesToHtml, highlightToHtml, rehypeCode, TOKEN_CLASS } =
    createRequire(import.meta.url)(dist);

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ code: ${msg}`);
        failures++;
    }
};
const kindOf = (lines, text) => lines.flat().find((t) => t.text === text)?.kind;
const joined = (lines) => lines.map((l) => l.map((t) => t.text).join('')).join('\n');

const SAMPLES = {
    ts: `import { verify } from '@orangecheck/stamp-core';
/* walk the proof */
const MAX_AGE = 1_000n;
export async function check(env: StampEnvelope): Promise<boolean> {
  const out = await verify(env, { headers: \`\${host}/api\` });
  return out.ok && env.ots?.status !== 'pending';
}`,
    tsx: `<OcSignIn audience="https://stamp.ochk.io" onSignedIn={(s) => router.push('/')} />`,
    json: `{ "kind": "stamp", "block_height": 971632, "ok": true, "note": null }`,
    bash: `$ npm install @orangecheck/stamp-core
curl -s https://stamp.ochk.io/api/verify | jq '.anchor' # check it
OC_NETWORK=mainnet yarn add --dev @orangecheck/gate`,
    python: `@dataclass
class Stamp:
    def check(self, height: int = 971632) -> bool:
        """Walk it."""
        return verify(self.envelope, f"block {height}") is not None`,
    yaml: `name: ci
jobs:
  build:
    timeout-minutes: 10 # pinned`,
};

for (const [lang, code] of Object.entries(SAMPLES)) {
    check(joined(highlight(code, lang)) === code, `${lang}: tokens do not join back to the source`);
}
check(joined(highlight('just text <b>', 'rust')) === 'just text <b>', 'an unknown language is not plain text');
check(highlight('a\nb\n', 'ts').length === 2, 'a trailing newline adds an empty line');

const ts = highlight(SAMPLES.ts, 'ts');
check(kindOf(ts, 'import') === 'keyword', 'ts: import is not a keyword');
check(kindOf(ts, "'@orangecheck/stamp-core'") === 'string', 'ts: a string is not a string');
check(kindOf(ts, '/* walk the proof */') === 'comment', 'ts: a block comment is not a comment');
check(kindOf(ts, 'MAX_AGE') === 'number', 'ts: a constant is not a constant');
check(kindOf(ts, '1_000n') === 'number', 'ts: 1_000n is not a number');
check(kindOf(ts, 'check') === 'function', 'ts: a declared function is not a function');
check(kindOf(ts, 'StampEnvelope') === 'type', 'ts: a type is not a type');
check(kindOf(ts, 'status') === undefined, 'ts: a property access is coloured');
const tsx = highlight(SAMPLES.tsx, 'tsx');
check(kindOf(tsx, 'OcSignIn') === 'tag', 'tsx: a JSX tag is not a tag');
check(kindOf(tsx, 'audience') === 'property', 'tsx: an attribute is not a property');
const json = highlight(SAMPLES.json, 'json');
check(kindOf(json, '"kind"') === 'property', 'json: a key is not a property');
check(kindOf(json, '"stamp"') === 'string', 'json: a value is not a string');
check(kindOf(json, 'true') === 'number' && kindOf(json, 'null') === 'number', 'json: true and null are not constants');
const sh = highlight(SAMPLES.bash, 'bash');
check(kindOf(sh, '$ ') === 'comment', 'shell: the prompt is not dimmed');
check(kindOf(sh, 'npm') === 'function' && kindOf(sh, 'jq') === 'function', 'shell: a command is not a command');
check(kindOf(sh, 'install') === undefined, 'shell: an argument is coloured as a command');
check(kindOf(sh, '-s') === 'keyword', 'shell: a flag is not a flag');
check(kindOf(sh, '# check it') === 'comment', 'shell: a comment is not a comment');
check(kindOf(sh, 'OC_NETWORK') === 'property' && kindOf(sh, 'yarn') === 'function', 'shell: FOO=bar cmd misreads');
const py = highlight(SAMPLES.python, 'python');
check(kindOf(py, 'check') === 'function' && kindOf(py, 'Stamp') === 'type', 'python: def or class misread');
check(kindOf(py, '"""Walk it."""') === 'string' && kindOf(py, 'None') === 'number', 'python: docstring or None misread');
const yaml = highlight(SAMPLES.yaml, 'yaml');
check(kindOf(yaml, 'timeout-minutes') === 'property' && kindOf(yaml, '10') === 'number', 'yaml: key or number misread');

// Diff and meta.
const d = readDiff('-const a = 1;\n+const a = 2;\n same();');
check(d.code === 'const a = 1;\nconst a = 2;\nsame();', 'diff: signs are not stripped');
check(d.diff.get(1) === 'remove' && d.diff.get(2) === 'add' && !d.diff.has(3), 'diff: lines are not marked');
const m = parseCodeMeta('title="gate.ts" {2,4-5} diff showLineNumbers');
check(m.title === 'gate.ts' && m.highlight === '2,4-5' && m.diff && m.lineNumbers, 'meta: not read');
check(!parseCodeMeta('title="a diff of b"').diff, 'meta: a word in the title turns on diff');
check([...parseLineRanges('3-1,5')].sort().join() === '1,2,3,5', 'ranges: not expanded');

// Markup: escaped, one span per line, marks where asked.
const html = highlightToHtml('const x = "<b>&";\nnext()', 'ts', { highlight: '2' });
check(html.includes('&lt;b&gt;&amp;') && !html.includes('<b>'), 'html: code is not escaped');
check(html.split('\n').length === 2 && /^<span data-line="">/.test(html), 'html: not one span per line');
check(/<span data-line="" data-mark="">.*next/.test(html.split('\n')[1]), 'html: line 2 is not marked');
check(!linesToHtml([[{ text: 'a' }]]).includes('data-mark'), 'html: an unmarked line is marked');

// The rehype plugin, on the tree remark-rehype makes for a fence.
const tree = {
    type: 'root',
    children: [
        {
            type: 'element',
            tagName: 'pre',
            properties: {},
            children: [
                {
                    type: 'element',
                    tagName: 'code',
                    properties: { className: ['language-ts'] },
                    data: { meta: 'title="gate.ts" {1}' },
                    children: [{ type: 'text', value: 'const a = 1;\n' }],
                },
            ],
        },
        {
            type: 'element',
            tagName: 'pre',
            properties: {},
            children: [{ type: 'element', tagName: 'code', properties: { className: ['language-mermaid'] }, children: [{ type: 'text', value: 'graph TD' }] }],
        },
    ],
};
rehypeCode()(tree);
const [pre, mermaid] = tree.children;
check(pre.properties.dataOcaCode === '' && pre.properties.dataLang === 'ts' && pre.properties.dataTitle === 'gate.ts', 'rehype: props not set');
check(pre.properties.dataHtml.includes('class="oca-k"') && pre.properties.dataHtml.includes('data-mark'), 'rehype: not highlighted');
check(pre.children.length === 0, 'rehype: the source is shipped twice');
check(mermaid.properties.dataOcaCode === undefined && mermaid.children.length === 1, 'rehype: mermaid is not left alone');

// Every kind has its colour.
const css = readFileSync(join(here, '../src/styles/code.css'), 'utf8');
for (const [kind, cls] of Object.entries(TOKEN_CLASS)) {
    check(css.includes(`.oca-code .${cls}`), `css: no colour for ${kind} (.${cls})`);
}

if (failures) {
    console.error(`\n${failures} code failure(s)`);
    process.exit(1);
}
console.log(`✓ code: ${checks} checks on the highlighter, the fence meta and rehypeCode`);
