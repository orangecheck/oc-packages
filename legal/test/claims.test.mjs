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
    [/in an owner-only console\./i, "vault's owner console lists accounts too"],
    // ochk.app's privacy policy (R17, 2026-11-11). A share releases cross-app numbers and
    // statements by consent; the registry publishes accepted keys; the list claims no completeness.
    [/regardless of scopes granted/i, 'a site can be shared cross-app numbers and statements, by consent'],
    [/(email,? or attestation tier|attestation tier only if)/i, 'attest_tier is retired; the policy lists the live shares'],
    [/charter publishes the operator key of each seated guardian, and nothing else/i, 'the operator registry also publishes every accepted key and when it was accepted'],
    [/what an auditor would find|every record orangecheck stores|a full account of what orangecheck stores/i, 'the stored-data list names records; it does not claim to be complete'],
    [/none enables fund movement|none of it lets orangecheck sign on your behalf/i, 'orangecheck holds keys for email, Google and GitHub sign-in, named under custody'],
    [/Drop manifests, which name no one/i, "a drop's manifest names the site's project and its amounts"],
    [/up to three cookies of its own|two cookies of its own/i, 'ochk.app sets up to nine cookies of its own, besides oc_logo'],
    [/Page analytics use orangecheck’s own counter at insights\.ochk\.io/i, 'ochk.app also loads overlook.technology’s counter'],
    [/On me\.ochk\.io, five cookies/i, 'me.ochk.io sets only oc_logo; the others are set by ochk.io and its sites'],
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

test('every privacy policy lists the logo cookie beside the other preference cookies', () => {
    for (const site of ['www', 'me', 'vault']) {
        const text = DOCS.find(([n]) => n === `${site}/privacy`)[1];
        assert.match(text, /oc_theme(?: ·|,) oc_skin(?: ·|,) oc_motion(?: ·|,| and) oc_logo/, site);
        assert.match(text, /oc_logo[^.]*only when you open a page with \?logo= in its address/, site);
    }
    assert.match(DOCS.find(([n]) => n === 'me/privacy')[1], /On ochk\.app, these cookies of its own[^]*oc_logo: which of our two logos you chose/);
});

// Every cookie ochk.app sets (oc-app-web lib/app.ts, auth/roster.ts, auth/handoff.ts, auth/oauth.ts;
// oc_logo from app-design's logo script), and the one a page script can read (R17-4).
test('the ochk.app privacy policy names every cookie ochk.app sets, and the one its page script reads', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    const cookies = text.slice(text.indexOf('On ochk.app, these cookies of its own'), text.indexOf('On me.ochk.io, whichever'));
    const named = new Set(cookies.match(/(?:__Host-)?oc_[a-z_]+[0-9]?/g));
    assert.deepEqual(
        [...named].sort(),
        [
            '__Host-oc_active',
            '__Host-oc_also_0',
            '__Host-oc_also_1',
            '__Host-oc_also_2',
            '__Host-oc_handoff_',
            '__Host-oc_handoff_guard',
            '__Host-oc_oauth',
            '__Host-oc_session',
            '__Host-oc_to_io',
            'oc_logo',
        ]
    );
    assert.match(cookies, /__Host-oc_active: the did:oc of the account you are using[^.]*\. It is not HttpOnly: ochk\.app’s own page script reads it/);
    assert.match(cookies, /the sign-in tokens of up to three other accounts signed in in this browser/);
    assert.match(cookies, /each kept for at most two minutes while a sign-in passes between ochk\.app and ochk\.io/);
    const meIo = text.slice(text.indexOf('On me.ochk.io, whichever'));
    assert.match(meIo, /Of these, me\.ochk\.io sets only oc_logo, when you open/);
    assert.match(meIo, /two cookie-free counters[^:]*: \[Plausible\]\(https:\/\/plausible\.io\/privacy\) and the same orangecheck counter as on ochk\.app/);
});

// ochk.app's two beacons (oc-app-web lib/oca/beacons.ts) and what overlook keeps (overlook.technology
// apps/dashboard/src/server/web/store.ts: no IP or user-agent stored, a daily-salted visitor id).
test('the ochk.app privacy policy names both page counters ochk.app loads, and how to opt out of the second', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    const app = text.slice(text.indexOf('On ochk.app, these cookies of its own'), text.indexOf('On me.ochk.io, whichever'));
    assert.match(app, /Page analytics on ochk\.app use two counters, neither of which sets a cookie/);
    assert.match(app, /insights\.ochk\.io counts a visit by a hash salted daily/);
    assert.match(app, /overlook\.technology keeps each page’s path, except pages whose address can name a person or a project/);
    assert.match(app, /never stores your IP address or browser string\. To opt out of overlook\.technology, open any page with \?ov_ignore=1/);
});

// What ochk.app keeps in a browser outside cookies: /trust's rows (oc-app-web
// components/oca/trust/PrivacyCompare.tsx BrowserStorage), and the IndexedDB record's
// fields (lib/operator/browser-key.ts OperatorIdentity).
test('the ochk.app privacy policy says what ochk.app keeps in your browser outside cookies', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    const app = text.slice(text.indexOf('On ochk.app, these cookies of its own'), text.indexOf('On me.ochk.io, whichever'));
    for (const rx of [
        /keeps these in your browser, outside cookies\. Unlike cookies, your browser attaches none of them to its requests/,
        /local storage your light or dark choice, under theme; the code tab you last picked/,
        /your alert switches on the account page and, on the balance page, when and where to suggest moving your balance/,
        /the setup steps you ticked, in the quickstart and on each of your projects’ pages/,
        /for each account signed in here, which of its areas it could open when last checked/,
        /each tab what a sign-in, a sign-out, a claim, a check or a write in progress needs, until the tab closes/,
        /IndexedDB only if you make, restore or import an operator key on the operator page: the key pair, its operator id, when it was added here, whether it was made in a browser or imported from the kit, and the version of the record, in oc-operator-key, filed under that account’s id until you delete it there/,
        /No request carries the private key/,
    ]) {
        assert.match(app, rx);
    }
});

// What a site can be shared (oc-me-web lib/privacy/scopes.ts, the scopes not deprecated) and what a
// backed account's sign-in token carries (oc-www lib/auth/bonds.ts bondClaim), R17-2.
test('the ochk.app privacy policy lists each share a site can ask for, and what backing tells a site', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    for (const fact of [
        'your Bitcoin address the address you added to your account',
        'your email the email address you added to your account',
        'how many events count for you across every app, how many of those you did yourself rather than an agent acting for you, the sats apps have paid you in all, how many apps have recorded events for you, when your first event was, and on how many days you have been active',
        'four numbers about the statements other apps have made about you: how many, how many good, from how many apps, and how many cautions',
        'the statements you choose, each in full: which app made it, what it says and when it ends. A statement you refused is never shared',
        'No share gives a site your balance, your site sign-ins or your events on other sites. Only your statements name another app, with what it said about you',
        'the amount and age floors the coin meets, when it was last checked, and a number for that coin that differs from site to site (all .ochk.io sites share one); never the coin, its address or its amount',
        'what sites get each site gets its own subject id for events, but signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you, and, if you back your account, what backs it, never the coin itself; anything more only if you share it with that site',
    ]) {
        assert.ok(text.includes(fact), fact);
    }
    const terms = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.ok(terms.includes('if you back your account, what backs it, never the coin itself. Anything more a site gets only if you share it with that site: your Bitcoin address, your email, numbers about your activity across apps, or statements other apps have made about you'));
});

// Records on ochk.io's database the stored-data list left out (R17-3), and the keys it is not (R17-25).
test('the ochk.app privacy policy names what sign-in stores beyond the account row', () => {
    const text = DOCS.find(([n]) => n === 'me/privacy')[1];
    for (const fact of [
        'records, not private keys',
        'None of them is a private key: the keys orangecheck holds for you are named under [custody](/terms#custody) in the Terms',
        'which of our sites you first signed up through',
        'with a keyed hash of it so we can find your account. An unkeyed hash of it is kept beside them until a planned change removes it',
        "that provider’s id for your account, unencrypted",
        'passkeys for each passkey you add: its credential id and public key',
        'the session’s id, the account id',
        'Sessions opened in the same browser share a roster id',
        'its address, outpoint and amount, the block height it confirmed at, the backing message you signed and your signature',
        'for each chat.ochk.io device ochk.io vouches for: its device and Nostr public keys',
        'the operator registry at me.ochk.io/api/operator/registry lists the operator key of every accepted application, the operator id made from that key, and when it was accepted, whether or not it holds a seat',
        "A drop’s manifest is published in full: it names the site’s project, the drop’s label and window, how many events and people it counted, its fees and what its recipients were paid in all, and no person",
        'retained as the canonical earnings and custody-state record until your account is deleted',
    ]) {
        assert.ok(text.includes(fact), fact);
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
    assert.match(terms, /ochk\.app is a commercial product operated by orangecheck/);
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
        'No share gives a site your balance, your site sign-ins or your events on other sites',
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
        'The answers are held for the review',
        'a federation charter lists the operator key of each seated guardian. Nothing else from an application is published yet',
        'Nothing is checked against an ID',
    ]) {
        assert.ok(privacy.includes(fact), fact);
    }
    // The charter text lists seat keys only (oc-me-web lib/operator/charter.ts), so no answer is said to be published.
    assert.ok(!/published in the federation charter|charter publishes its handle/.test(privacy), 'no answer said to be published');
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
        "in owner-only consoles: analytics.ochk.io and, for a vault account, vault.ochk.io's",
        'the first character of the part before the @ when that part has three or more characters, and none of it otherwise',
        'Their account searches and actions refuse an email address: an account is found by email only through a lookup',
        "Revealing one address, or looking up one account, asks for a written reason, which is recorded before your email address is shown",
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

// While payouts are in testing no one can start a cash-out: a balance above zero is settled by
// hand before the account is deleted (lead decision, 2026-11-08).
test('the ochk.app terms and privacy say a balance is settled by hand before deletion', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        assert.doesNotMatch(text, /instruct a cash-out|settle a non-zero balance first/i, name);
        assert.match(
            text,
            /While payouts are in testing there is no cash-out to start yourself: if your balance is above zero, \[contact us\]\(\/contact\) before you delete, and we settle it by hand first\./,
            name
        );
    }
});

// The decided words: in testing, what you earn, account id (lead decision, 2026-11-08).
// The terms' summary line is all lowercase on purpose, product names too.
test('the ochk.app terms and privacy use the decided words', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        assert.doesNotMatch(text, /bring-?up/i, `${name}: in testing`);
        assert.doesNotMatch(text, /cash-?back/i, `${name}: what you earn`);
        assert.doesNotMatch(text, /did_oc/, `${name}: account id`);
        assert.doesNotMatch(text, /your settings/i, `${name}: ochk.app calls it the Account page`);
        assert.match(text, /your Account page/, `${name}: names the Account page`);
    }
    const { summary } = buildDoc('me', 'terms');
    assert.equal(summary, summary.toLowerCase());
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

test('each privacy policy opens with a dated note of what changed, newest first', () => {
    // The policy promises prominent notice of material changes; the October corrections were material.
    // Each note names every change to what is kept or who sees it (site-attest, 2026-10-31).
    const notes = {
        www: {
            first: '31 October',
            facts: [
                'the owner consoles, analytics.ochk.io and vault.ochk.io',
                'the roster id that links accounts signed in from one browser, the site you signed up through',
                'a coin that backs it (its address, outpoint and amount, and the message you signed)',
                'OC Chat device vouches and revocations, which are also published to Nostr relays',
                'the sign-in log keeps it for 90 days',
                'three OpenTimestamps calendars and reads mempool.space, and each sees your IP address',
                'Each session and the sign-in log keep the full user-agent',
                "relay.ochk.io keeps each record with a pseudonym of the sender's IP address, replaced each UTC day, and never the address itself",
                "our host's connection logs for it hold your IP address and connection times for 7 days",
            ],
        },
        me: {
            first: '11 November',
            updated: '2026-11-11',
            lead: /^\*\*What changed, 8 October to 11 November 2026\.\*\* We corrected this policy where it did not say what is kept, who sees it, or what deleting does to a balance\./,
            facts: [
                'The operator registry publishes the operator key of every accepted application and when it was accepted, and a federation charter the operator key of each seated guardian; nothing else from an application is published yet',
                "each of ochk.app's cookies and both of its page counters",
                'what ochk.app keeps in your browser outside cookies (an operator key record in IndexedDB only if you make, restore or import one)',
                'passkeys, a coin backing your account, your Google or GitHub id, the hashes kept beside your email',
                'a balance above zero is settled by hand before your account is deleted',
                'the contact form sends your email address',
                'a session record keeps no IP address, and the sign-in log keeps it for 90 days',
                'me.ochk.io records which sites you sign in to or share data with, and when',
                'a keyed hash of your email if the site sent one',
                "ochk.app's own cookies are listed",
                'a session record keeps your user-agent',
            ],
        },
        vault: {
            first: '31 October',
            facts: [
                'an emailed team invite keeps the invitee',
                'the email goes through our email provider (Resend)',
                'keeps payment records under a keyed id, and is refused while you own a team that still has other members',
            ],
        },
    };
    // 0.7.29 changed ochk.app's wording only; 0.7.30 lists the logo cookie, a preference like oc_theme
    // that says nothing about you. Neither changed what is kept about you, so neither adds a note.
    // 0.7.32 says how ochk.app settles a balance before deletion, so its note and date move to 8 November.
    // 0.7.34 says what a federation charter publishes from a guardian application, so they move to 11 November.
    // 0.7.35 adds the registry, the shares, every ochk.app cookie, its second page counter and the records the list left out, under the same date.
    // 0.7.36 adds what ochk.app keeps in your browser outside cookies, the operator key record among it, under the same date.
    const OCTOBER = /^\*\*What changed, 8 to 31 October 2026\.\*\* We corrected this policy where it did not say what is kept or who sees it\./;
    for (const [site, { first, facts, updated = '2026-11-06', lead: heading = OCTOBER }] of Object.entries(notes)) {
        const doc = buildDoc(site, 'privacy');
        const [lead, list] = doc.preamble ?? [];
        assert.equal(lead?.kind, 'callout', site);
        assert.match(lead.text, heading, site);
        assert.match(lead.text, /the \[changelog\]\(https:\/\/github\.com\/orangecheck\/oc-packages\/blob\/main\/legal\/CHANGELOG\.md\) lists every change\.$/, site);
        assert.equal(list?.kind, 'bullets', site);
        assert.equal(list.items[0].k, first, site);
        const text = list.items.map((it) => `${it.k} ${it.v}`).join(' ');
        for (const f of facts) assert.ok(text.includes(f), `${site}: ${f}`);
        assert.equal(doc.updated, updated, site);
    }
});

test('vault privacy says an emailed invite keeps your address and carries the team key only sealed', () => {
    const text = DOCS.find(([n]) => n === 'vault/privacy')[1];
    assert.match(text, /emailed team invite if a team manager emails you an invite: your email address, which is kept on the invite and shown to the team's managers, and sent with the invite link through our email provider \(Resend\)/);
    assert.match(text, /The link carries the team key only sealed under a one-time code the manager gives you themselves; OrangeCheck never sees the code or the key/);
    assert.match(text, /The invite is deleted when a manager revokes it, with the team, or when the account that sent or claimed it is deleted/);
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

// Sign-in is email, Google, GitHub or a Bitcoin wallet (lead ruling, 2026-11-03).
test('the ochk.app terms name every way to sign in', () => {
    const accounts = buildDoc('me', 'terms').sections.find((s) => s.id === 'accounts');
    const text = accounts.blocks.map((b) => b.text ?? '').join(' ').replace(/[*`]/g, '');
    assert.match(
        text,
        /You may create an identity four ways: with email \(a one-time code\), Google, GitHub, or a Bitcoin wallet \(/
    );
    assert.doesNotMatch(text, /two ways/i);
    assert.doesNotMatch(accounts.hint ?? '', /\btwo\b/i);
    // Wherever the terms say who holds a key by sign-in, the keyless ways are named together.
    const terms = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.doesNotMatch(terms, /sign in with email(?!, Google or GitHub)/i);
    assert.doesNotMatch(terms, /email users/i);
});

// No app pays real sats yet, so ochk.app's documents say paying in the future tense (lead ruling, 2026-11-03).
test('the ochk.app terms and privacy say paying in the future tense', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        assert.doesNotMatch(text, /\b(pays|flows back to) (you|users|every user)\b/i, name);
        assert.doesNotMatch(text, /\bit pays (to )?(you|every user)\b/i, name);
    }
    assert.match(buildDoc('me', 'terms').description, /identity that will pay you in sats/i);
});

// While the system is in testing orangecheck holds every key that can move funds, and even
// the planned federation stage keeps orangecheck's executor holding each claim until it pays
// out. ochk.app's own words promise no federation stage it has not built (oc-app-web
// custody-promises.test.ts); its terms and privacy hold to the same list (lead ruling, 2026-11-03).
const CUSTODY_PROMISES = [
    [/federation[^.'"`]{0,40}replaces? (it|orangecheck)/i, 'a federation replacing orangecheck'],
    [/until (a|an independent) federation (runs|settles|holds|takes|replaces)/i, 'custody that ends when a federation arrives'],
    [/once a federation runs the network/i, 'what a federation will do'],
    [/federation (next|takes over)|federations take (it )?over|self-custody exit next/i, 'a federation next'],
    [/today a federation holds/i, 'a federation holding funds today'],
    [/orangecheck is not one of (them|its guardians)|guardian operators, not orangecheck/i, 'a federation without orangecheck'],
    [/orangecheck cannot move funds/i, 'orangecheck unable to move funds'],
    [/keys only you hold|moves? to keys they hold|independent federations, and then your own keys/i, 'own keys'],
    [/graduat\w*[^.]{0,60}at any time|graduation as the destination/i, 'self-custody on demand'],
    [/what replaces it/i, 'a federation replacing orangecheck'],
    [/custodied and disbursed by independent/i, 'a federation paying people'],
    [/federation ⇄ self-custody transition/i, 'a record per custody move'],
    [/graduation|sweep to self-custody/i, 'a later move to self-custody'],
    [/the party that moves the money/i, 'payouts that move today'],
];

test('the ochk.app terms and privacy promise no federation stage that is not built', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        const text = DOCS.find(([n]) => n === name)[1];
        for (const [rx, what] of CUSTODY_PROMISES) assert.doesNotMatch(text, rx, `${name}: ${what}`);
    }
    // The planned stage, in the words ochk.app's custody copy uses.
    assert.match(
        DOCS.find(([n]) => n === 'me/terms')[1],
        /executor holds your claim on it, as ecash, until it is paid out to a Lightning wallet you choose/
    );
});

// ochk.app writes its brand lowercase, as its pages do, and while no entity is registered the
// bare name the documents define is that brand (lead ruling, 2026-11-03).
test('the ochk.app terms and privacy write orangecheck lowercase, the defined name too', () => {
    for (const name of ['me/terms', 'me/privacy']) {
        assert.doesNotMatch(DOCS.find(([n]) => n === name)[1], /OrangeCheck/, name);
    }
    assert.match(DOCS.find(([n]) => n === 'me/terms')[1], /the party of record is orangecheck \(OCHK\), an unincorporated project\. References to "orangecheck" mean that party/);
});

// An unbacked account is tied to no bitcoin, and only a signature checks offline; a timestamp
// checks against Bitcoin once it is anchored (lead rulings 1 and 21, 2026-11-03).
test('the ochk.app terms say what checks offline, and what backing ties an account to', () => {
    const terms = DOCS.find(([n]) => n === 'me/terms')[1];
    assert.doesNotMatch(terms, /identity is anchored in Bitcoin|anchored in Bitcoin, verifiable offline/i);
    // Only a paid event's receipt is signed (me-web isPublicEnvelope), and the check needs the key me.ochk.io publishes.
    assert.doesNotMatch(terms, /Every receipt for your account is signed/);
    assert.match(terms, /Every paid event on your account has a receipt, signed by us/);
    assert.match(terms, /anyone holding one and the public key we publish can check its signature offline, without asking us/);
    assert.match(terms, /If you back your account, it is tied to bitcoin you hold/);
});
