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

// Every skin is rooted in the Bitcoin ethos — sharp, flat, cypherpunk — and
// carries a meaning, not just a colour: the chain, the node, the network, sound
// money. No SaaS softness.
export const OC_THEMES: readonly OcTheme[] = [
    {
        id: 'orangecheck',
        label: 'orangecheck',
        description: 'the chain — Bitcoin orange, sharp 0.25rem corners, Inter + JetBrains Mono',
    },
    {
        id: 'phosphor',
        label: 'phosphor',
        description: 'the node — CRT terminal green, hard 0.125rem, all-mono · sovereignty & verify',
    },
    {
        id: 'lightning',
        label: 'lightning',
        description: 'the network — electric violet (L2), hardest 0rem edges, sans · instant',
    },
    {
        id: 'gold',
        label: 'gold',
        description: 'sound money — digital gold, hard 0.125rem milled edge, mono ledger · 21M',
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
