import type * as React from 'react';

/*
 * Every type and shape choice below reads a CSS variable whose fallback is the
 * family look, so a site with a design of its own (ochk.app) restyles the
 * ceremony by setting variables on an ancestor, never by forking it. Family
 * sites set none and render exactly as before.
 *
 *   --oc-signin-font           labels, buttons, fields   (monospace)
 *   --oc-signin-case           labels and buttons        (uppercase)
 *   --oc-signin-tracking       letter-spacing of labels  (per label)
 *   --oc-signin-scale          multiplies the 10–12px label sizes (1)
 *   --oc-signin-radius         fields and notices        (6px; 4px for the add notice)
 *   --oc-signin-button-radius  buttons                   (6px)
 *   --oc-signin-strong         weight of the submit text (600)
 *   --oc-signin-arrow          display of the → after a submit label (inline)
 *
 * Sizes by role. Each falls back to the family size, so a site that sets none
 * renders as before; app-design sets its own body, hint, label and button sizes.
 *
 *   --oc-signin-text-size      the lead under a tab, notices, the link-also row
 *   --oc-signin-hint-size      hints, errors, the "or" between blocks
 *   --oc-signin-label-size     field labels and the method tabs
 *   --oc-signin-button-size    the submit button and the text buttons beside it
 *
 * Copy is written in sentence case. The family's uppercase transform shows it
 * as before; a site that sets the case to `none` reads it as written.
 */
export const SIGNIN_FONT = 'var(--oc-signin-font, ui-monospace, SFMono-Regular, monospace)';
export const SIGNIN_CASE = 'var(--oc-signin-case, uppercase)' as React.CSSProperties['textTransform'];
export const signinTracking = (em: string): string => `var(--oc-signin-tracking, ${em})`;
export const signinSize = (px: number): string => `calc(${px}px * var(--oc-signin-scale, 1))`;
export const signinRadius = (px: number): string => `var(--oc-signin-radius, ${px}px)`;
export const SIGNIN_BUTTON_RADIUS = 'var(--oc-signin-button-radius, 6px)';
export const SIGNIN_STRONG = 'var(--oc-signin-strong, 600)' as React.CSSProperties['fontWeight'];
export const SIGNIN_ARROW = 'var(--oc-signin-arrow, inline)' as React.CSSProperties['display'];

export type SigninRole = 'text' | 'hint' | 'label' | 'button';
/** A role's size: the site's, else `fallback`, the family size for that element. */
export const signinRoleSize = (role: SigninRole, fallback: string): string =>
    `var(--oc-signin-${role}-size, ${fallback})`;
