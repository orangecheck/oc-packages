/**
 * The OrangeCheck theme (skin) registry.
 *
 * A *skin* is the named-theme axis, orthogonal to the light/dark *mode* axis
 * (which stays owned by `next-themes` via the `.dark` class). A skin is applied
 * as `data-oc-theme="<id>"` on `<html>` and persisted in the `oc_skin` cookie at
 * `Domain=.ochk.io` so a choice on one family site carries to every other.
 *
 * Adding a skin = add a `themes/<id>.css` token block in this package and a
 * row here. Every site picks it up on the next `@orangecheck/design` bump; no
 * per-site edits.
 */
export interface OcTheme {
    /** Stable id — also the `data-oc-theme` attribute value and the CSS file stem. */
    readonly id: string;
    /** Human label for the picker (lowercase, house voice). */
    readonly label: string;
    /** One-line description shown in the picker / Storybook. */
    readonly description: string;
}

export const OC_THEMES: readonly OcTheme[] = [
    {
        id: 'orangecheck',
        label: 'orangecheck',
        description: 'the default — Bitcoin-orange on sharp ink, cypherpunk not SaaS',
    },
    {
        id: 'midnight',
        label: 'midnight',
        description: 'cool indigo accent on deep slate — calm, terminal-after-dark',
    },
] as const;

export const DEFAULT_OC_THEME = 'orangecheck';

export type OcThemeId = (typeof OC_THEMES)[number]['id'] | (string & {});

export function isKnownTheme(id: string | null | undefined): id is OcThemeId {
    return !!id && OC_THEMES.some((t) => t.id === id);
}

export function resolveTheme(id: string | null | undefined): string {
    return isKnownTheme(id) ? id : DEFAULT_OC_THEME;
}

/** Cookie name for the cross-subdomain skin choice. */
export const OC_SKIN_COOKIE = 'oc_skin';
