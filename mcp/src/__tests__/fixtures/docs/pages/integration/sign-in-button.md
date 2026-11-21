# The sign-in button

Your sign-in button already has a look. Keep it. The orangecheck button takes
your button's class and draws nothing of its own: it brings the orangecheck
mark, the words, the popup and the busy state. Install `@orangecheck/me-client`
0.47.0 or later; [what changed](https://ochk.io/docs/integration/sign-in-button#versions) says what each version added.

## In three different sites

Three made-up sites, each with its own buttons. Beside each site's own button is
the orangecheck button, given the same class, then the mark alone in the site's
icon button. Switch the docs between light and dark to see both. Signing in here
opens the real orangecheck window.

## React

```tsx
import type { ReactElement } from 'react';

import { SignInWithOrangecheck } from '@orangecheck/me-client/react';

import '@orangecheck/me-client/button.css';

declare function keepSession(token: string): Promise<void>;

export function SignIn(): ReactElement {
    return (
        <SignInWithOrangecheck
            className="btn btn-outline"
            onSignedIn={({ token }) => keepSession(token)}
        />
    );
}
```

`keepSession` posts the token to your server, which verifies it with
[`withOcAuth`](https://ochk.io/docs/me/sdk) and keeps it in an httpOnly cookie. Import `button.css`
once; it is optional and has zero specificity, so every rule of yours wins over
it. Without it the button is yours with the mark in it.

| Prop              | Type                                               | Default                    |                                                                                                                            |
| ----------------- | -------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `onSignedIn`      | `(result: OcPopupResult) => void \| Promise<void>` | required                   | Called with `{ account, token }`. The button stays busy until it settles.                                                  |
| `onOutcome`       | `(outcome: OcPopupOutcome) => void`                | none                       | Called with how every window ended, an object with a `status`. See [when it doesn't sign in](https://ochk.io/docs/integration/sign-in-button#when-it-doesnt-sign-in).     |
| `appearance`      | `'inherit' \| 'brand'`                             | `inherit`                  | `inherit` adds no colour, font, border, radius or focus ring. `brand` is orangecheck's button.                             |
| `mark`            | `'mono' \| 'brand' \| 'tile' \| false`             | `mono`                     | `false` for none. See [the mark](https://ochk.io/docs/integration/sign-in-button#the-mark).                                                                               |
| `label`           | `string \| false`                                  | "Sign in with orangecheck" | The words, in your language if you like, keeping "orangecheck". `false` draws the mark alone. See [the words](https://ochk.io/docs/integration/sign-in-button#the-words). |
| `busyLabel`       | `string`                                           | "Signing in…"              | What it says while the window is open.                                                                                     |
| `accessibleLabel` | `string`                                           | "Sign in with orangecheck" | What a screen reader says for the mark alone.                                                                              |
| `popup`           | `{ popupOrigin?, popupPath?, features? }`          | none                       | Popup options, such as a preview `popupOrigin`.                                                                            |

`enhanceSignInButton(button, options)` takes the same options
(`EnhanceSignInButtonOptions`). The types come with the package:

```ts
import type {
    OcPopupOutcome,
    OcPopupResult,
} from '@orangecheck/me-client/button';

// OcPopupResult is { account, token }: account.did_oc names the person, and
// the token goes to your server, which verifies it.
export function didOf(result: OcPopupResult): string | undefined {
    return result.account.did_oc;
}

// OcPopupOutcome is one of { status: 'signed_in', account, token },
// { status: 'blocked' }, { status: 'closed' }, { status: 'aborted' } or
// { status: 'failed' }.
export function signedIn(outcome: OcPopupOutcome): boolean {
    return outcome.status === 'signed_in';
}
```

Everything else (`className`, `style`, `id`, `aria-describedby`, `disabled`)
goes to the native `<button>`.

## Plain HTML and JavaScript

No framework, no bundler. Write the button as you write every other one, and add
`data-oc-sign-in`, with an empty `<span data-oc-mark>` where the mark goes:

```html
<button class="cta ghost" data-oc-sign-in>
    <span data-oc-mark></span>Sign in with orangecheck
</button>
<p id="oc-note" role="status"></p>
```

`button.css` gives the empty span the mark's size, so the button is its final
width before the script runs, and drawing the mark moves nothing. Words already
in the button are kept if they say "orangecheck". For the mark alone, leave the
words out and add `data-label="none"`:

```html
<button class="icon-button" data-oc-sign-in data-label="none">
    <span data-oc-mark></span>
</button>
```

Then enhance it:

```js
import {
    enhanceSignInButton,
    OUTCOME_COPY,
} from '@orangecheck/me-client/button';

const button = /** @type {HTMLButtonElement} */ (
    document.querySelector('[data-oc-sign-in]')
);
const note = /** @type {HTMLElement} */ (document.querySelector('#oc-note'));

enhanceSignInButton(button, {
    onSignedIn: async ({ token }) => {
        const r = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        if (r.ok) location.assign('/dashboard');
    },
    onOutcome: (outcome) => {
        if (
            outcome.status === 'blocked' ||
            outcome.status === 'closed' ||
            outcome.status === 'failed'
        ) {
            note.textContent = OUTCOME_COPY[outcome.status];
        }
    },
});
```

Under a strict Content-Security-Policy (`script-src 'self'`), copy
`node_modules/@orangecheck/me-client/dist/button.mjs` and `dist/button.css` onto
your own origin and import them from there. `button.mjs` has no imports, and it
builds the mark node by node, so it needs no `innerHTML` and works with Trusted
Types. Load it before the click: a window opened after an await is blocked.

`enhanceSignInButton` returns a function that puts the button back as it was.

### From a CDN

To load it from jsDelivr, pin the exact version and let the browser check every
byte with Subresource Integrity, so a changed file is refused rather than run on
your page. Integrity covers a `<script src>`, not an `import` in an inline
script, so load `button-auto.mjs`: it enhances every `[data-oc-sign-in]` button
itself and reports through events, and your own script imports nothing.

```html
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/@orangecheck/me-client@0.63.0/dist/button.css"
    integrity="sha384-sC/eCPifaPRw5uhfJ5CnivxoSQjDufNAgucHrk7it2UxmcvxlAryKABgyei2c8rZ"
    crossorigin="anonymous"
/>

<button class="cta ghost" data-oc-sign-in>
    <span data-oc-mark></span>Sign in with orangecheck
</button>
<p id="oc-note" role="status"></p>

<script
    type="module"
    src="https://cdn.jsdelivr.net/npm/@orangecheck/me-client@0.63.0/dist/button-auto.mjs"
    integrity="sha384-XM1YwqwIVX7o+lUmbMeU6qQgWF+tEzziyvIqBHxB/x26nkqLqkMA56SPuAPONtl4"
    crossorigin="anonymous"
></script>
<script>
    document.addEventListener('oc-signed-in', (event) => {
        const { token, waitUntil } = event.detail;
        waitUntil(
            fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            }).then((r) => {
                if (r.ok) location.assign('/dashboard');
            })
        );
    });
    document.addEventListener('oc-sign-in-outcome', (event) => {
        document.getElementById('oc-note').textContent = event.detail.message;
    });
</script>
```

| Event                | `detail`                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| `oc-signed-in`       | `account`, `token`, and `waitUntil(promise)`: the button stays busy until it settles.   |
| `oc-sign-in-outcome` | `status`, and `message`: the words to show near the button (empty when there are none). |

Both events are dispatched on the button and bubble, so `event.target` says
which button it was. Any script on your page can fire them too, and a
`CustomEvent` is never trusted: never trust `account` from the event in the
browser. Send only the token to your server, and let its check
([`withOcAuth` or `checkOcToken`](https://ochk.io/docs/me/sdk)) be the only answer.

The button carries its options: `data-mark` (`mono`, `brand`, `tile`, `none`),
`data-appearance` (`inherit`, `brand`), `data-busy-label`,
`data-accessible-label` and `data-label="none"`. It takes no popup address, on
purpose: any script on your page could set one and point your button at a
look-alike sign-in. To test against a stand-in popup, use `button.mjs` and pass
`popup: { popupOrigin, popupPath }` from your own code, as the
[examples' offline mode](https://ochk.io/docs/integration/reference#run-it-with-no-account) does.
[A stand-in sign-in window](https://ochk.io/docs/me/sdk#a-stand-in-sign-in-window) says what the
window must do.

The hashes above are for the files of the me-client version the snippet pins, as
npm publishes them. A new version has new hashes: your project's HTML snippet on
ochk.app always shows the current pair. Under a strict Content-Security-Policy,
copy `dist/button-auto.mjs` and `dist/button.css` onto your own origin instead.

## orangecheck's own button

If you would rather not style it, `appearance="brand"` is orangecheck's button:
ink, with the mark as drawn. Theme it with custom properties.

| Property               | Default   |
| ---------------------- | --------- |
| `--oc-button-bg`       | `#0a0a0a` |
| `--oc-button-fg`       | `#fafafa` |
| `--oc-button-border`   | `#262626` |
| `--oc-button-hover-bg` | `#262626` |
| `--oc-button-radius`   | `10px`    |
| `--oc-button-font`     | your font |
| `--oc-button-size`     | `1rem`    |
| `--oc-button-weight`   | `600`     |
| `--oc-button-pad`      | `1.25em`  |
| `--oc-focus`           | `#fb933c` |

Both appearances read these:

| Property         | Default |                                                                                                                                                          |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--oc-mark-gap`  | `0.6em` | The space between the mark and the words.                                                                                                                |
| `--oc-mark-size` | `1.6em` | The mark's width; its height is 5/8 of that, one line of words. The tile is `1.5em` square.                                                              |
| `--oc-target`    | `44px`  | The smallest height, and the mark alone's smallest width. 44px is the rule. Lower it only if your own buttons already give a 44px target some other way. |

## While it works

- Clicking opens the orangecheck window inside the click, before anything is
  awaited, so browsers do not block it.
- While the window is open the button says "Signing in…" (or your `busyLabel`),
  and has `aria-busy="true"` and `aria-disabled="true"`. It keeps focus, keeps
  its width so nothing beside it moves, and opens no second window.
- Its accessible name follows the words it shows, so a screen reader hears
  "Signing in…" while the window is open, as everyone else reads it. In a test
  or a script, find the button by `[data-oc-sign-in]`, never by its name: the
  name changes while it works.
- When the window closes, the button is ready again, and `onOutcome` says why.
  See [when it doesn't sign in](https://ochk.io/docs/integration/sign-in-button#when-it-doesnt-sign-in).
- A button you set `disabled` never opens a window.

## When it doesn't sign in

`onOutcome` gets an object, and its `status` says how the window ended. For
three of them, `OUTCOME_COPY` has the words to show near the button:

| `status`    | When                                                                                      | What to tell the person (`OUTCOME_COPY`)                                                           |
| ----------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `signed_in` | The person signed in. `onSignedIn` runs next.                                             | Nothing.                                                                                           |
| `blocked`   | The browser refused to open the window, usually a pop-up blocker.                         | `blocked`: "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again." |
| `closed`    | The person closed the window before finishing. Their choice, not an error.                | `closed`: "The sign-in window closed before you finished."                                         |
| `failed`    | The window ended without a usable answer: it reported a sign-in with no account or token. | `failed`: "Sign-in didn't finish. Try again."                                                      |
| `aborted`   | Your own code cancelled the wait, which the button never does.                            | Nothing.                                                                                           |

```ts
import type { OcPopupOutcome } from '@orangecheck/me-client/button';

import { OUTCOME_COPY } from '@orangecheck/me-client/button';

// The words to show near the button, or '' when there is nothing to say.
export function noteFor(outcome: OcPopupOutcome): string {
    if (
        outcome.status === 'blocked' ||
        outcome.status === 'closed' ||
        outcome.status === 'failed'
    ) {
        return OUTCOME_COPY[outcome.status];
    }
    return '';
}
```

The tag-loaded button reports the same through its `oc-sign-in-outcome` event,
whose `detail` is `{ status, message }`, with these words already in `message`.

## For everyone

- Inside a button with words, the mark is decoration: `aria-hidden`, never
  focused. The words name the button.
- The mark alone is named by `aria-label`, "Sign in with orangecheck" or your
  `accessibleLabel`, and is at least 44px each way.
- `inherit` draws no focus ring of its own, so your site's ring shows, as on
  your other buttons. If your buttons have no visible focus style, give them
  one. `brand` has its own ring.
- When the system forces its own colours (Windows contrast themes), the mark
  becomes one flat shape in the button's text colour, the tile loses its ink
  square, and `brand`'s edge and ring take the system colours.
- The words stay on one line, and the mark has its size before it is drawn.

## The mark

The orangecheck mark is an isometric check. It ships with no dependencies in
[`@orangecheck/mark`](https://www.npmjs.com/package/@orangecheck/mark), and
inside the button.

| Variant | Use it                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mono`  | Anywhere your button's text has 3:1 contrast with its background. It is drawn in your text colour: its three faces at full, 60% and 30% strength. |
| `brand` | On dark backgrounds only. Its lightest face is about 1.1:1 on white.                                                                              |
| `tile`  | On any background: the brand mark on its own ink tile.                                                                                            |

```ts
import { markSvg } from '@orangecheck/mark';

declare const slot: HTMLElement;

slot.insertAdjacentHTML('afterbegin', markSvg({ variant: 'mono' }));
```

### In pixels

`pixel: true` draws the pixel mark: the same check in square cells, 32 by 20.
Its edges stay sharp only where each cell is a whole number of screen pixels, so
draw it 32, 64, 96 or 128px wide, and the pixel tile 48, 96, 144 or 192px. Use
it for an avatar, a splash screen or a game's title. Beside words, as in a
button, use the smooth mark.

```ts
import { markSvg } from '@orangecheck/mark';

const icon = markSvg({ variant: 'tile', pixel: true, width: '96' });
```

A renderer that draws its own cells takes them from `markPixelRuns(perUnit)`:
each face as runs of cells at 1, 1.5 or 2 cells a unit (16 by 10, 24 by 15 or 32
by 20).

### As files

Each variant as SVG and PNG, the brand mark and the tile in pixels as well, a
favicon set, avatars, a social card and a banner are in the
[media kit](https://github.com/orangecheck/oc-media-kit/tree/main/dist/orangecheck-mark)
(`dist/orangecheck-mark/`). It is copied from the published `@orangecheck/mark`,
whose version the kit's `manifest.json` names, so the files match the package.

## Native apps and games

`@orangecheck/mark/assets/` has every variant as SVG and as PNG at 16, 24, 32,
40, 48, 64, 80, 96, 128 and 256 px wide (`orangecheck-mark-mono-white-32.png`,
and so on). The mark is 8 wide to 5 tall, so the 32px file is 20px tall, the
size beside 16px words, and the 64px file is the same mark for a 2x screen.
`orangecheck-mark-pixel-brand` (32 to 512px) and `orangecheck-mark-pixel-tile`
(48 to 480px) are the pixel mark, at whole pixels a cell. `mono-white` reads on
a dark theme, `mono-black` on a light one, and `tile` on either. In Godot 4:

```gdscript
var button := Button.new()
button.text = "Sign in with orangecheck"
button.icon = preload("res://ui/orangecheck-mark-mono-white-64.png")
button.add_theme_constant_override("icon_max_width", 32)
button.custom_minimum_size.y = 44
```

The words are plain text. Keep your theme's font, colours and focus style.

In a web export, the page that hosts the game opens the orangecheck window, as
in [plain HTML](https://ochk.io/docs/integration/sign-in-button#plain-html-and-javascript). A native build signs the player in
through their own browser: see [apps and games](https://ochk.io/docs/integration/native-sign-in).

Download them from npm, or straight from
[jsDelivr](https://cdn.jsdelivr.net/npm/@orangecheck/mark/assets/).

## Versions

Each row is what that version added to the button. The full history is
me-client's
[CHANGELOG](https://github.com/orangecheck/oc-packages/blob/main/me-client/CHANGELOG.md).

| Version | What changed                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.46.0  | The button: `/button` (`enhanceSignInButton`), `/react` (`SignInWithOrangecheck`) and `button.css`.                                                                                                                      |
| 0.47.0  | Words in any language that keep "orangecheck"; `busyLabel`; the mark alone (`label: false`); the `[data-oc-mark]` placeholder; the width held while busy; `inherit` drops its own focus ring, so your site's ring shows. |
| 0.48.0  | `button-auto.mjs`: a `<script src>` that enhances every `button[data-oc-sign-in]` and reports through `oc-signed-in` and `oc-sign-in-outcome` events.                                                                    |
| 0.63.0  | The mark as the ochk.app design draws it: its sides twice as deep, `1.6em` by `1em` beside the words, the tile `1.5em`, `0.6em` from the words.                                                                          |

## The rules

### The words

| Use                              | Words                     |
| -------------------------------- | ------------------------- |
| Default                          | Sign in with orangecheck  |
| A flow that continues an account | Continue with orangecheck |
| A sign-up form                   | Sign up with orangecheck  |
| While the window is open         | Signing in…               |

These are the defaults (`SIGN_IN_LABELS`). In another language, write your own,
and keep the name as it is: "orangecheck", lowercase, a word of its own.

For an action other than signing in, these words are approved too. Use them only
when the button does exactly that.

| Action                                                    | Words                                |
| --------------------------------------------------------- | ------------------------------------ |
| Connect an account on your site to an orangecheck account | Link orangecheck                     |
| Remove that connection                                    | Unlink orangecheck                   |
| Confirm a sensitive action by signing in again            | Sign in with orangecheck to `action` |

For example, "Sign in with orangecheck to delete" on the button that confirms
deleting an account.

```tsx
import type { ReactElement } from 'react';

import { SignInWithOrangecheck } from '@orangecheck/me-client/react';

declare function keepSession(token: string): Promise<void>;

export function Connexion(): ReactElement {
    return (
        <SignInWithOrangecheck
            className="btn"
            label="Se connecter avec orangecheck"
            busyLabel="Connexion…"
            onSignedIn={({ token }) => keepSession(token)}
        />
    );
}
```

The button refuses words without "orangecheck" in them, and "OC" or
"OrangeCheck" in its place.

### Size and space

- The mark is at least 16px wide. At the default size it is 1.6em, so 16px text
  gives a 25.6px mark, 16px tall: one line of words.
- Leave clear space around the mark of at least a quarter of its width. The
  default gap to the words is 0.6em.
- Keep the button at least 44px tall.

### Never

- Recolour the mark other than mono in your text colour, or put the brand mark
  on a light background.
- Stretch it, rotate it, split its faces, crop it or outline it.
- Show it larger than your own brand. It says the sign-in goes through
  orangecheck; it does not stand for your site.

The code and files are MIT. The mark is orangecheck's trademark, and
[the trademark policy](https://github.com/orangecheck/oc-packages/blob/main/TRADEMARK.md)
says how it may be used. Using it in a sign-in button, as above, is fine.
