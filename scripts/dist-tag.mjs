/**
 * The npm dist-tag a release publishes under, so `latest` never moves backwards.
 *
 * A plain `npm publish` points `latest` at whatever published last. When
 * releases queue up (an npm outage, a re-run of a failed job), an older
 * version can publish after a newer one and take `latest` from it: every
 * caret install and every Renovate PR would then step back.
 *
 * The rule:
 *   - a prerelease (1.4.0-beta.1) publishes as `next`, never `latest`;
 *   - a package npm has never seen publishes as `latest`;
 *   - a version above the current `latest` publishes as `latest`;
 *   - anything else (an older line's patch, a late re-run) publishes as
 *     `v<major>.<minor>-line` and leaves `latest` where it is.
 *
 * Usage: node scripts/dist-tag.mjs <package name> <version>
 * Prints the tag, and writes `tag=<tag>` to $GITHUB_OUTPUT when it is set.
 * Fails rather than guess when npm cannot say what `latest` is.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** A version's parts, or null when it is not semver. Build metadata is dropped: it never orders. */
export function parse(version) {
    const m = SEMVER.exec(String(version).trim());
    if (!m) return null;
    return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

/** -1, 0 or 1, as semver 2.0.0 §11 orders two versions. */
export function compare(a, b) {
    const x = parse(a);
    const y = parse(b);
    if (!x || !y) throw new Error(`not a semver version: ${!x ? a : b}`);
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
    // A release outranks any of its prereleases.
    if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        const p = x.pre[i];
        const q = y.pre[i];
        if (p === undefined) return -1;
        if (q === undefined) return 1;
        if (p === q) continue;
        const pn = /^\d+$/.test(p);
        const qn = /^\d+$/.test(q);
        // Numeric identifiers compare as numbers and rank below alphanumeric ones.
        if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
        if (pn !== qn) return pn ? -1 : 1;
        return p < q ? -1 : 1;
    }
    return 0;
}

/** The dist-tag for `version`, given the registry's current `latest` (null when the package is new). */
export function chooseTag(version, latest) {
    const v = parse(version);
    if (!v) throw new Error(`not a semver version: ${version}`);
    if (v.pre.length) return 'next';
    if (!latest) return 'latest';
    return compare(version, latest) > 0 ? 'latest' : `v${v.core[0]}.${v.core[1]}-line`;
}

/** The registry's `latest` for a package: null for a package it has never seen. */
function currentLatest(name) {
    try {
        const out = execFileSync('npm', ['view', name, 'dist-tags.latest', '--json'], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        return out ? JSON.parse(out) : null;
    } catch (e) {
        const said = `${e.stdout ?? ''}${e.stderr ?? ''}`;
        if (/E404|404 Not Found/.test(said)) return null;
        throw new Error(`npm could not say what ${name}'s latest is, so the tag is not guessed: ${said.trim().split('\n').slice(-2).join(' ')}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [name, version] = process.argv.slice(2);
    if (!name || !version) {
        console.error('usage: node scripts/dist-tag.mjs <package name> <version>');
        process.exit(2);
    }
    try {
        const latest = currentLatest(name);
        const tag = chooseTag(version, latest);
        if (tag === 'latest') console.log(`${name}@${version} publishes as latest (was ${latest ?? 'none'})`);
        else console.log(`::notice::${name}@${version} publishes as ${tag}; latest stays ${latest ?? 'unset'}`);
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
        else console.log(tag);
    } catch (e) {
        console.error(`::error::${e.message}`);
        process.exit(1);
    }
}
