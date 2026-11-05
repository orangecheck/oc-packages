/**
 * A 32px icon button's target on a touch screen: 44px, drawn by a pseudo-element
 * around it, so its look and the row's spacing do not change.
 */
export const HIT_32 = 'relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5';

/**
 * A link in a line of text, such as a HashChip's: on a touch screen a target 44px tall and at
 * least 44px wide, and to a mouse 24 by 24 at least (WCAG 2.5.8), centred on the text by a
 * pseudo-element, so the line keeps its height.
 */
export const HIT_LINK =
    'relative before:absolute before:left-1/2 before:top-1/2 before:h-6 before:w-full before:min-w-6 before:-translate-x-1/2 before:-translate-y-1/2 pointer-coarse:before:h-11 pointer-coarse:before:min-w-11';

/**
 * HIT_LINK for the links a slot is handed (a banner's action, a block's sources): set on the slot,
 * it reaches each link that is a direct child, so a TextLink passed in needs nothing of its own.
 */
export const HIT_LINKS =
    '[&>a]:relative [&>a]:before:absolute [&>a]:before:left-1/2 [&>a]:before:top-1/2 [&>a]:before:h-6 [&>a]:before:w-full [&>a]:before:min-w-6 [&>a]:before:-translate-x-1/2 [&>a]:before:-translate-y-1/2 pointer-coarse:[&>a]:before:h-11 pointer-coarse:[&>a]:before:min-w-11';
