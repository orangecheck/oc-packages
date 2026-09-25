// check-a11y-floors — static guards for two floors every family site inherits.
//
// 1. No `text-muted-foreground/NN` in shipped source. Muted text is 5.25:1 on
//    its background in the weakest skin (orangecheck dark); any opacity under
//    1 pushes some skin × mode under WCAG AA's 4.5:1 for small text (0.9 →
//    4.33 in ember light). Quiet hierarchy comes from size and case instead.
// 2. theme.css keeps the unlayered 16px floor for form fields under md, or
//    iOS Safari zooms the viewport whenever a field takes focus.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const fails = [];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.stories\.tsx$/.test(name)) {
            readFileSync(p, 'utf8')
                .split('\n')
                .forEach((line, i) => {
                    if (/(^|[^-\w])text-muted-foreground\/\d+/.test(line)) {
                        fails.push(`${path.relative(root, p)}:${i + 1} dims muted text with an opacity modifier`);
                    }
                });
        }
    }
}
walk(root);

const theme = readFileSync(path.join(root, 'styles', 'theme.css'), 'utf8');
// Brace depth 0 at the match means it sits outside every `@layer`, so it outranks `text-xs`.
const floor = theme.match(/@media \(width < 48rem\) \{\s*input:not\([^{]*\),\s*textarea,\s*select \{\s*font-size: 16px;/);
if (!floor) {
    fails.push('styles/theme.css: the unlayered 16px form-field floor under md is missing');
} else {
    const before = theme.slice(0, floor.index);
    const depth = [...before].reduce((d, c) => d + (c === '{' ? 1 : c === '}' ? -1 : 0), 0);
    if (depth !== 0) fails.push(`styles/theme.css: the form-field floor is nested (brace depth ${depth}); it must be unlayered`);
}

if (fails.length) {
    console.error('a11y-floors:\n  ' + fails.join('\n  '));
    process.exit(1);
}
console.log('a11y-floors: ok');
