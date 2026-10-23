/**
 * @orangecheck/me-client/connect-consent
 *
 * The words for an optional "also make me an orangecheck account" box on a
 * site that keeps its own login (OC Connect). Plain strings with no imports, so
 * any UI can render its own checkbox: React, Vue, a server template, plain HTML.
 *
 *   import {
 *     CONNECT_CONSENT_LABEL,
 *     CONNECT_CONSENT_BLURB,
 *   } from '@orangecheck/me-client/connect-consent';
 *
 * Show the box unticked, never pre-ticked and never bundled with your Terms.
 * Ticked: call connectProvision with `consent: true`. Unticked: make no call.
 */

/** The checkbox label. */
export const CONNECT_CONSENT_LABEL = 'Also create my orangecheck account';

/** One sentence under the label. */
export const CONNECT_CONSENT_BLURB =
    'An identity you can use on other sites, held by orangecheck until you claim it at ' +
    'ochk.app, where you can also delete it.';
