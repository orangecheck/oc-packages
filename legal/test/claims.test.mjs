// The rendered Terms and Privacy text must say what the code stores. Each
// banned phrase below was live and false (October 2026): the auth host stores
// the email for email/Google/GitHub sign-in, the raw user-agent per session and
// the IP per sign-in (not on the session row since #357), sets oc_session
// SameSite=None, deletes nothing on a timer, and vault stores its key sealed
// on the server. Runs against the built dist, whitespace
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
    [/(each session|session record) a hash of the session token[^.]{0,60}\bIP\b/i, 'session rows hold no IP; the sign-in log does'],
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
    // Every product keeps a deleted account's record under a keyed id only (#313), and we
    // hold the key, so the record names no one by itself; it is not unlinkable.
    [/deleted, under its id/i, 'deletion records are kept under a keyed id, never the did'],
    [/no longer leads to (you|the person)/i, 'we hold the key: the record by itself names no one'],
    // Every site a person signs in to gets the same did:oc, so sites can match them.
    [/unlinkable across sites/i, 'signing in gives every site the same did:oc'],
    [/cannot collude/i, 'signing in gives every site the same did:oc'],
    [/cannot correlate you/i, 'signing in gives every site the same did:oc'],
    [/not yet deleted automatically|no automatic deletion yet/i, 'expired sessions are deleted on the next sign-in'],
    [/our host's proxy, not yours/i, 'the relay stores a daily pseudonym of the IP, not the proxy address'],
    [/There is no OC Vault browser extension yet/i, 'the extension is built and public, not yet in a store'],
    [/does not remove it — ask us/i, 'deleting the account removes the sealed vault key'],
    [/account list shows each account's email/i, 'the Users panel masks every email; a reveal or lookup asks for a reason recorded first'],
    [/naming your did:oc and the identity you signed in with/i, 'sign-up notices after 29 October 2026 name only the account id and the kind of sign-in'],
    [/from market data alone/i, "btc's commentary also uses the model's web searches"],
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
    for (const rx of [/user-agent string/i, /SameSite=None/i, /encrypted at rest/i, /a session that expires after 30 days is deleted the next time anyone signs in/i]) {
        assert.match(text, rx);
    }
});

test('ochk.io and ochk.app privacy say the sign-in log keeps the IP, for 90 days', () => {
    for (const name of ['www/privacy', 'me/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        assert.match(
            text,
            /sign-in log each sign-in and each identity you link or remove, with the IP address[^.]*the IP address is cleared after 90 days/i,
            name,
        );
        assert.match(
            text,
            /IP addresses in the sign-in log cleared after 90 days; the entries themselves stay until your account is deleted/i,
            name,
        );
    }
});

test('ochk.io terms and privacy name the calendars an OC Chat handle claim reaches, and that they see the IP', () => {
    const calendars = [
        'alice.btc.calendar.opentimestamps.org',
        'bob.btc.calendar.opentimestamps.org',
        'finney.calendar.eternitywall.com',
    ];
    for (const name of ['www/terms', 'www/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        for (const host of calendars) assert.ok(text.includes(host), `${name}: ${host}`);
        assert.match(text, /each of these sees your IP address and when you asked/i, name);
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


// Site sign-ins (me.ochk.io records which live sites a person signed in to or
// shared data with): stored, never shown to a site, erased with the account or
// the site's project, and the gate before a site can name the person as earner.
test('the ochk.app privacy policy says what it keeps about the sites you sign in to', () => {
    const [, text] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(text, 'me/privacy renders');
    for (const fact of [
        'site sign-ins which live sites you signed in to or shared data with through orangecheck, and when',
        'A site can name you as the person who earned for an event only once this record exists',
        "No site sees it, and it is erased with your account or with that site's project",
        'your wallet balance, your site sign-ins, or any cross-integrator data',
    ]) {
        assert.ok(text.includes(fact), fact);
    }
    assert.ok(!text.includes('connected-sites list'), 'one name for the record');
});

// A guardian operator's deletion (#302): when it can happen, and what the
// operator key's signed records keep after it.
test('the ochk.app privacy policy says when an operator can delete, and what the key keeps', () => {
    const [, text] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(text, 'me/privacy renders');
    for (const fact of [
        'If you run a guardian, you can delete only once your operator key holds no seat or hosted guardian',
        'has finished any exit, created no federation that still exists, and is owed nothing',
        'stay public under the key, with what you wrote in them',
        "exit records and machine reports stay visible to that federation's guardians and to us",
        'We keep a record that your account was deleted, out of public view',
        // Receipts, the request and that record: each named once, under the deletion's own sentence.
        "Each keeps your account only as a keyed id, or not at all, so the record by itself doesn't say whose account it was",
    ]) {
        assert.ok(text.includes(fact), fact);
    }
});

// Sign-in hands every site the same did:oc; only event subjects are per site.
test('the ochk.app terms and privacy say sites that compare ids can tell it is you', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        const [, text] = DOCS.find(([n]) => n === name) ?? [];
        assert.ok(text, `${name} renders`);
        assert.ok(
            text.includes(
                'Signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you'
            ) ||
                text.includes(
                    'signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you'
                ),
            name
        );
    }
});

test('ochk.io privacy names relay.ochk.io, the pseudonym its records keep, and its 7-day connection logs', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    assert.match(text, /relay\.ochk\.io[^.]*the Nostr relay we run/i);
    assert.match(text, /stored with a pseudonym of the IP address it came from, made with a key that is kept only in memory and replaced each UTC day[^;]*; your IP address itself is never stored, and the pseudonym is never served or archived/);
    assert.match(text, /Our hosting provider \(Fly\.io\) carries each connection to it and handles your IP address to do so, for its own short retention window; we keep no separate copy/);
    assert.match(text, /Our host's connection logs for the relay can hold your IP address and connection times; they are kept for 7 days/);
    assert.match(text, /relay\.ochk\.io connections[^;]*Fly\.io\) for its own short retention window; its connection logs for the relay can hold your IP address and connection times for 7 days/i);
});

// No legal name for people who sign in, use apps or get paid; a guardian application names its operator.
test('the ochk.app terms and privacy scope the no-legal-name claim and say what a guardian application asks', () => {
    const [, terms] = DOCS.find(([name]) => name === 'me/terms') ?? [];
    const [, privacy] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(terms && privacy, 'me/terms and me/privacy render');
    assert.ok(terms.includes('does not require your legal name, government ID, or physical address to sign in, use apps or get paid'));
    assert.ok(privacy.includes('never collects your legal name, government ID, or physical address from people who sign in, use apps or get paid'));
    for (const fact of [
        'made through ochk.app or by email to apply@ochk.io',
        'asks, among other things, for a public handle, the name of the person or organisation that will run the guardian, its jurisdiction, a public contact channel, a key fingerprint and two references',
        'an optional handle and email address that only the reviewer sees, for the decision',
        'The questionnaire’s handle, name, jurisdiction, contact channel and fingerprint are published in the federation charter, because guardians are named trust anchors',
        'Nothing is checked against an ID, and nothing else is published',
    ]) {
        assert.ok(privacy.includes(fact), fact);
    }
    for (const text of [terms, privacy]) {
        assert.ok(!/physical address\.|physical address['"]/.test(text), 'no unscoped no-legal-name claim');
    }
});

// A deletion's leftovers: backups and the CDN's cached copies, worded as the erasure email words them.
test('the ochk.app privacy policy says how long backups and cached copies of a deleted account last', () => {
    const [, text] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(text, 'me/privacy renders');
    assert.ok(text.includes('Backups roll off within 30 days, and copies cached by our CDN expire within a day.'));
});

// What a deletion keeps, in the words the erasure email and ochk.app's deletion page use.
test('the ochk.app privacy policy says what a deletion keeps, and that 48 hours is an aim', () => {
    const [, text] = DOCS.find(([name]) => name === 'me/privacy') ?? [];
    assert.ok(text, 'me/privacy renders');
    for (const said of [
        'and erases your data on ochk.io, me.ochk.io, vault, chat and cosign, except a few records.',
        'Payment records keep their amounts and times for accounting, and our audit log and your deletion request stay, without the reason you gave.',
        "Each keeps your account only as a keyed id, or not at all, so the record by itself doesn't say whose account it was.",
        "On cosign, your messages in conversations with other people and the reports you filed stay, with your account taken off them.",
        'A person completes the request, and we aim to do that within 48 hours: an alert tells us when one has waited a day.',
        'your data is erased, except the few records named under identity & account deletion',
    ]) {
        assert.ok(text.includes(said), said);
    }
    assert.ok(!text.includes('reviews the request within 48 hours'), 'no 48-hour promise');
    assert.ok(!/your data is erased and your sign-in closes/.test(text), 'no unqualified erasure');
});

// chat, cosign, btc and globe link ochk.io/privacy and /terms, so both must cover them.
test('ochk.io terms and privacy cover chat, cosign, btc and globe', () => {
    for (const name of ['www/terms', 'www/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        for (const host of ['chat.ochk.io', 'cosign.ochk.io', 'btc.ochk.io', 'globe.ochk.io']) {
            assert.ok(text.includes(host), `${name}: ${host}`);
        }
    }
});

test('ochk.io privacy says what sign-in stores beyond the account, and who can read the email', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    for (const fact of [
        "that provider's id for your account, unencrypted",
        'sessions opened in the same browser share a roster id',
        'its address, outpoint and amount, the backing message you signed',
        'the signed revocation, which we also publish to Nostr relays',
        'the market thresholds you save on btc.ochk.io (up to 25)',
        "Its account list shows each email address masked, and its search refuses an email address: an account is found by email only through a lookup",
        "Revealing one, or looking up one account, asks for a written reason, which is recorded before your email address is shown",
    ]) {
        assert.ok(text.includes(fact), fact);
    }
});

test('ochk.io privacy says cosign messages are not end-to-end encrypted, and chat messages are', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    assert.match(text, /cosign\.ochk\.io[^]*messages not end-to-end encrypted\. They are stored on our servers, and OrangeCheck's operators can read them/);
    assert.match(text, /chat\.ochk\.io[^]*messages end-to-end encrypted\. Our server holds a message only as ciphertext/);
});

test('the ochk.app terms say when a payout is held and what releases it', () => {
    const text = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.match(text, /We hold a payout, and do not send it, when an earlier attempt to send it may already have gone through/);
    assert.match(text, /never retried on its own: we check the payment node, then either mark it paid with the payment's proof or release it to be sent again/);
    assert.match(text, /A hold does not cancel what you are owed/);
    assert.match(text, /for 24 hours after you change your payout destination/);
});

test('ochk.io privacy says who completes a deletion, what blocks it, and what stays', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    for (const fact of [
        'A person completes the request, and we aim to do that within 48 hours',
        'Nothing is erased while a blocker remains',
        'the email our operators received when you first signed in',
        'a hashed record of it, so that site is told the account was deleted',
    ]) {
        assert.ok(text.includes(fact), fact);
    }
});

test('vault privacy says the extension exists and that deleting the account removes the sealed key', () => {
    const text = DOCS.find(([n]) => n === 'vault/privacy')[1];
    assert.match(text, /extension is built for Chrome and Firefox but is not yet in either browser's store/);
    assert.match(text, /deleting the cloud copy does not remove it, and deleting your account does/);
    assert.match(text, /refused while you own a team that still has other members/);
});

test('ochk.io privacy says what the first-sign-in notice names, up to and after 29 October 2026', () => {
    const text = DOCS.find(([n]) => n === 'www/privacy')[1];
    assert.match(text, /naming your did:oc and the kind of sign-in you used[^.]*\. Notices sent up to and including 29 October 2026 \(UTC\) also named the identity itself/);
    assert.match(text, /names your did:oc and the kind of sign-in you used, and, if it was sent up to and including 29 October 2026 \(UTC\), the identity itself/);
});

test('the ochk.app privacy policy says what its contact form sends', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    assert.match(text, /contact form at ochk\.app\/contact sends your email address, an optional name, the topic you pick and your message to our inbox through our email provider \(Resend\)/);
});
