// verify-sigil-transforms — locks the assumptions OcSigil's prepare() makes
// about the vendored glyph markup, so a future glyphs.ts re-vendor can't
// silently no-op the frame-strip / stroke-normalize / focus regexes (which
// would ship a broken sigil with a green build). Pure text over glyphs.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const glyphs = readFileSync(path.join(here, '..', 'src', 'tokens', 'glyphs.ts'), 'utf8');

// Keep in sync with sigil.tsx.
const TILE = ['stamp', 'pledge', 'cosign', 'me', 'fleet', 'docs'];
const FOCUS = ['stamp', 'pledge', 'cosign', 'me', 'fleet', 'docs', 'vote', 'btc'];
const FRAME = /<rect x="6" y="6" width="12" height="12"[^>]*\/>/;

function glyphBody(slug) {
    // Match `slug: \`...\`,` — the backtick-delimited markup string.
    const m = glyphs.match(new RegExp(`\\b${slug}:\\s*\`([\\s\\S]*?)\`,`));
    return m ? m[1] : null;
}

const errors = [];

for (const slug of [...new Set([...TILE, ...FOCUS])]) {
    if (glyphBody(slug) === null) errors.push(`${slug}: glyph not found in glyphs.ts`);
}

for (const slug of TILE) {
    const body = glyphBody(slug);
    if (body === null) continue;
    const hits = body.match(new RegExp(FRAME, 'g'));
    if (!hits) errors.push(`${slug}: TILE frame regex matched 0 times (frame-strip would no-op)`);
    else if (hits.length !== 1) errors.push(`${slug}: TILE frame regex matched ${hits.length}× (expected 1)`);
}

// Every glyph that carries strokes must expose them to the normalizer.
for (const slug of ['attest', 'lock', 'vault', 'chat', 'agent', ...TILE]) {
    const body = glyphBody(slug);
    if (body && !/stroke-width="[\d.]+"/.test(body)) {
        errors.push(`${slug}: no stroke-width found — normSw would never fire`);
    }
}

if (errors.length) {
    console.error('sigil-transforms: FAILED\n  ' + errors.join('\n  '));
    process.exit(1);
}
console.log(`sigil-transforms: OK (${TILE.length} tile frames, ${FOCUS.length} focus targets present)`);
