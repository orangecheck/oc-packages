// The rendered Terms and Privacy text must say what the code stores. Each
// banned phrase below was live and false (October 2026): the auth host stores
// the email for email/Google/GitHub sign-in and the raw user-agent and IP per
// session, sets oc_session SameSite=None, deletes nothing on a timer, and vault
// stores its key sealed on the server. Runs against the built dist, whitespace
// collapsed, so a line-wrap in the source cannot hide a phrase.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDoc, LEGAL_SITES } from '../dist/index.mjs';

function flatten(doc) {
    const out = [doc.title, doc.description, doc.metaDescription, doc.summary ?? ''];
    const block = (b) => {
        if (b.kind === 'bullets') {
            for (const it of b.items) out.push(typeof it === 'string' ? it : `${it.k} ${it.v}`);
        } else out.push(b.text);
    };
    (doc.preamble ?? []).forEach(block);
    for (const s of doc.sections) {
        out.push(s.heading, s.hint ?? '');
        s.blocks.forEach(block);
    }
    return out.join(' ').replace(/[*`]/g, '').replace(/\s+/g, ' ');
}

const DOCS = Object.keys(LEGAL_SITES).flatMap((site) =>
    ['terms', 'privacy'].map((kind) => [`${site}/${kind}`, flatten(buildDoc(site, kind))])
);

const BANNED = [
    [/no password,? no email/i, 'email, Google and GitHub sign-in store the email'],
    [/Sign in with Bitcoin\*?\*? flow/i, 'sign-in is Bitcoin, email, Google or GitHub'],
    [/user-agent hash/i, 'session rows store the raw user-agent'],
    // The family cookie. ochk.app's own __Host-oc_session is a different cookie and is Lax.
    [/(?<!__Host-)oc_session[^;]{0,140}?SameSite=Lax/i, 'oc_session is SameSite=None in production'],
    [/httpOnly \+ Secure \+ SameSite=Lax/i, 'oc_session is SameSite=None in production'],
    [/\bphone\b/i, 'no phone sign-in exists'],
    [/retained 90 days|90 days[^.]{0,40}auto-deleted/i, 'no 90-day log store exists'],
    [/24 months/i, 'no idle-account deletion job exists'],
    [/no email, no name/i, 'vault files data under the did:oc; sign-in may be email'],
    [/never leaves your (device|control)/i, 'the vault key is stored sealed on our server'],
    [/vault key or any recovery material/i, 'the sealed key and recovery wrap are stored'],
    [/works offline with \[?@?(orangecheck\/)?vault-core/i, 'the plain export has no key; the encrypted backup does'],
    [/OC Vault for Chromium/i, 'no browser extension is released'],
    [/Nostr-published (envelopes|event roots)/i, 'me.ochk publishes a salted commitment, never the envelope'],
    // The Service is ochk.app; me.ochk.io is its API, not the product.
    [/\bme\.ochk\.io (is an?|is not|is designed|does|publishes|never collects|provides)\b/i, 'the Service is ochk.app; me.ochk.io is its API'],
    [/(accessing or using|stop using|integrate|Nothing) me\.ochk\.io/i, 'the Service is ochk.app; me.ochk.io is its API'],
    [/commercial products \*?\*?me\.ochk\.io/i, 'the commercial product is ochk.app'],
];

test('every doc renders', () => {
    assert.ok(DOCS.length >= 6);
});

for (const [rx, truth] of BANNED) {
    test(`no doc says ${rx.source} (${truth})`, () => {
        const offenders = DOCS.filter(([, text]) => rx.test(text)).map(([name]) => name);
        assert.deepEqual(offenders, []);
    });
}

test('ochk.io privacy names the signup email to operators', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    assert.match(text, /operators get an email[^.]*Resend[^.]*did:oc/i);
});

test('ochk.io privacy names what sign-in stores', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    for (const rx of [/user-agent string/i, /SameSite=None/i, /encrypted at rest/i, /no automatic deletion yet/i]) {
        assert.match(text, rx);
    }
});

test('vault privacy says the key is stored sealed', () => {
    const text = DOCS.find(([n]) => n === 'vault/privacy')[1];
    assert.match(text, /sealed vault key/i);
});

test('me privacy names ochk.app and its own cookies', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    for (const rx of [/ochk\.app and its API at me\.ochk\.io/i, /__Host-oc_session[^.]*bound to ochk\.app/i, /__Host-oc_oauth/i]) {
        assert.match(text, rx);
    }
});

test('me terms govern the Service at both addresses', () => {
    const text = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.match(text, /API is served at me\.ochk\.io[^.]*govern the Service at either address/i);
});

test('me terms and privacy name ochk.app as the Service', () => {
    const terms = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.match(terms, /ochk\.app is a commercial product operated by OrangeCheck/);
    assert.match(terms, /By accessing or using ochk\.app or its API at me\.ochk\.io, you agree/);
    for (const kind of ['terms', 'privacy']) {
        assert.match(buildDoc('me', kind).metaTitle, /— ochk\.app$/);
    }
});

test('ochk.io terms and privacy name ochk.app as the commercial product', () => {
    for (const name of ['www/terms', 'www/privacy']) {
        assert.match(DOCS.find(([n]) => n === name)[1], /commercial products ochk\.app and vault\.ochk\.io/);
    }
});

// An account a site made through Connect (privacy, ochk.app): what is kept and
// how it ends, as ochk.io stores it since #266. No sign-in times: it has none.
test('the ochk.app privacy policy says what a site-made account keeps, and how it is deleted', () => {
    const [, text] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(text, 'me/privacy renders');
    for (const fact of [
        'a hash of the id the site gave you, never the id',
        'a keyed hash of your email address if the site sent one, never the address',
        'It keeps no sign-in times',
        'for sign-in only and earns nothing',
        'The site can delete it too',
    ]) {
        assert.ok(text.includes(fact), fact);
    }
});

