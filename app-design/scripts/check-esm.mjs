// A bundler resolving an .mjs file needs fully specified paths: a bare
// `next/link` fails the build of every consumer that does not transpile us.
import { readdirSync, readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const bare = /\bfrom\s*["']next\/(?!.*\.js["'])[\w/-]+["']/;
const bad = readdirSync(dist)
    .filter((f) => f.endsWith('.mjs'))
    .filter((f) => bare.test(readFileSync(new URL(f, dist), 'utf8')));
if (bad.length) {
    console.error(`✗ esm: bare next/* import in ${bad.join(', ')}; import 'next/link.js'`);
    process.exit(1);
}
console.log('✓ esm: every next/* import in dist/*.mjs is fully specified');
