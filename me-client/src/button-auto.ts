/**
 * Browser only, for a page that loads the sign-in button by a tag: it
 * enhances every `button[data-oc-sign-in]` when it runs and reports through
 * DOM events, so it can come from a CDN with Subresource Integrity, which
 * covers a `<script src>` but no `import` in an inline script.
 *
 *   <button class="your-button" data-oc-sign-in><span data-oc-mark></span>Sign in with orangecheck</button>
 *   <script type="module" src="https://cdn.jsdelivr.net/npm/@orangecheck/me-client@0.48.0/dist/button-auto.mjs"
 *           integrity="sha384-…" crossorigin="anonymous"></script>
 *   <script>
 *     document.addEventListener('oc-signed-in', (e) => e.detail.waitUntil(keepSession(e.detail.token)));
 *     document.addEventListener('oc-sign-in-outcome', (e) => { note.textContent = e.detail.message; });
 *   </script>
 *
 * The button says what it should: its own words (they must say "orangecheck"),
 * and `data-mark` (mono, brand, tile, none), `data-appearance` (inherit,
 * brand), `data-busy-label`, `data-accessible-label`, `data-label="none"`.
 *
 * @packageDocumentation
 */

import { enhanceSignInButton, OUTCOME_COPY, type EnhanceSignInButtonOptions, type OcPopupOutcome, type OcPopupResult } from './button';

export type { OcPopupOutcome, OcPopupResult } from './button';

/** `oc-signed-in`: the popup's account and token. The button stays busy until every `waitUntil` promise settles. */
export interface OcSignedInDetail extends OcPopupResult {
    waitUntil(work: Promise<unknown>): void;
}

/** `oc-sign-in-outcome`: how the window ended, and what to tell the person (empty when there is nothing to say). */
export interface OcSignInOutcomeDetail {
    status: OcPopupOutcome['status'];
    message: string;
}

const done = new WeakSet<Element>();

function optionsOf(button: HTMLButtonElement): EnhanceSignInButtonOptions {
    const data = button.dataset;
    const options: EnhanceSignInButtonOptions = {
        onSignedIn: async ({ account, token }) => {
            const work: Promise<unknown>[] = [];
            const detail: OcSignedInDetail = { account, token, waitUntil: (p) => void work.push(Promise.resolve(p)) };
            button.dispatchEvent(new CustomEvent('oc-signed-in', { bubbles: true, detail }));
            await Promise.all(work);
        },
        onOutcome: (outcome) => {
            const message = outcome.status in OUTCOME_COPY ? OUTCOME_COPY[outcome.status as keyof typeof OUTCOME_COPY] : '';
            const detail: OcSignInOutcomeDetail = { status: outcome.status, message };
            button.dispatchEvent(new CustomEvent('oc-sign-in-outcome', { bubbles: true, detail }));
        },
    };
    if (data.mark !== undefined) options.mark = data.mark === 'none' ? false : (data.mark as EnhanceSignInButtonOptions['mark']);
    if (data.appearance !== undefined) options.appearance = data.appearance as EnhanceSignInButtonOptions['appearance'];
    if (data.busyLabel !== undefined) options.busyLabel = data.busyLabel;
    if (data.accessibleLabel !== undefined) options.accessibleLabel = data.accessibleLabel;
    return options;
}

/** Enhance every sign-in button under `root` not already enhanced. A button it cannot enhance is reported and skipped. */
export function enhanceAll(root: ParentNode = document): number {
    let count = 0;
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-oc-sign-in]')) {
        if (done.has(button)) continue;
        try {
            enhanceSignInButton(button, optionsOf(button));
            done.add(button);
            count++;
        } catch (err) {
            console.error(err);
        }
    }
    return count;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhanceAll(), { once: true });
    else enhanceAll();
}
