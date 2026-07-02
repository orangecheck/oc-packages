// check-glyph-drift — fails when the vendored glyph artifact has drifted from
// oc-media-kit's generated copy. The media kit is the single source of truth
// for glyph geometry (build/emit_glyphs.py bakes the centering/flip/scale the
// Python pipeline owns); this package only vendors the output. Skips cleanly
// when the sibling checkout isn't present (CI runners), so it's a workspace
// guard, not a hard gate.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const vendored = path.join(here, '..', 'src', 'tokens', 'glyphs.ts');
const source = path.join(here, '..', '..', '..', 'oc-media-kit', 'dist', 'glyphs', 'glyphs.ts');

if (!existsSync(source)) {
    console.log('glyph-drift: oc-media-kit checkout not found — skipped');
    process.exit(0);
}
if (readFileSync(vendored, 'utf8') !== readFileSync(source, 'utf8')) {
    console.error(
        'glyph-drift: src/tokens/glyphs.ts differs from oc-media-kit/dist/glyphs/glyphs.ts.\n' +
            'Regenerate (python3 build/emit_glyphs.py in oc-media-kit) and re-vendor the file.'
    );
    process.exit(1);
}
console.log('glyph-drift: in sync');
