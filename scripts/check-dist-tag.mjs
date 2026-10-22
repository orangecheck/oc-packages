/**
 * dist-tag.mjs orders versions as semver does and never hands `latest` to a
 * version at or below the current one. Usage: node scripts/check-dist-tag.mjs
 */
import { compare, chooseTag } from './dist-tag.mjs';

let failures = 0;
const check = (ok, msg) => {
    if (!ok) {
        console.error(`✗ dist-tag: ${msg}`);
        failures++;
    }
};

// Ordering: each pair is lower, higher.
const ascending = [
    ['1.15.3', '1.16.0'],
    ['1.9.0', '1.10.0'],
    ['1.0.9', '1.0.10'],
    ['0.9.9', '0.10.0'],
    ['0.0.3', '0.1.0'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-alpha.beta', '1.0.0-beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-beta.11', '1.0.0-rc.1'],
    ['1.0.0-rc.1', '1.0.0'],
];
for (const [lo, hi] of ascending) {
    check(compare(lo, hi) === -1 && compare(hi, lo) === 1, `${lo} does not order below ${hi}`);
}
check(compare('1.2.3', '1.2.3') === 0, '1.2.3 is not equal to itself');
check(compare('1.2.3+build.7', '1.2.3') === 0, 'build metadata changed the order');
check(compare('v2.0.0', '2.0.0') === 0, 'a leading v changed the order');

// The tag.
const cases = [
    ['1.16.0', '1.15.3', 'latest', 'a newer minor'],
    ['2.0.0', '1.99.9', 'latest', 'a new major'],
    ['0.10.0', '0.9.4', 'latest', 'a 0.x minor past 0.9'],
    ['1.15.4', '1.16.0', 'v1.15-line', 'an older line patched after a newer release'],
    ['1.15.0', '1.16.0', 'v1.15-line', 'a late re-run of an older release'],
    ['1.16.0', '1.16.0', 'v1.16-line', 'the same version as latest'],
    ['0.6.5', '0.7.0', 'v0.6-line', 'an older 0.x line'],
    ['1.0.0', null, 'latest', 'a package npm has never seen'],
    ['2.0.0-beta.1', '1.16.0', 'next', 'a prerelease above latest'],
    ['1.0.0-rc.1', null, 'next', "a new package's prerelease"],
];
for (const [version, latest, want, what] of cases) {
    const got = chooseTag(version, latest);
    check(got === want, `${what}: ${version} over ${latest ?? 'none'} tagged ${got}, want ${want}`);
}
// npm refuses a tag that is itself a semver range (1.15, v1.15): the line tag never is one.
check(!/^v?\d+(\.\d+)?$/.test(chooseTag('1.15.4', '1.16.0')), 'the line tag reads as a version range');
let threw = false;
try {
    chooseTag('1.2', '1.1.0');
} catch {
    threw = true;
}
check(threw, 'a non-semver version was given a tag');

if (failures) {
    console.error(`\n${failures} dist-tag failure(s)`);
    process.exit(1);
}
console.log(`✓ dist-tag: ${ascending.length * 2 + 3 + cases.length + 2} checks; semver order with prereleases and 0.x, latest only moves forward`);
