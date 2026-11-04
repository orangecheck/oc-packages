/**
 * A 32px icon button's target on a touch screen: 44px, drawn by a pseudo-element
 * around it, so its look and the row's spacing do not change.
 */
export const HIT_32 = 'relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5';

/**
 * A link in a line of text, such as a HashChip's: on a touch screen a target 44px tall and at
 * least 44px wide, centred on the text by a pseudo-element, so the line keeps its height.
 */
export const HIT_LINK =
    'relative pointer-coarse:before:absolute pointer-coarse:before:left-1/2 pointer-coarse:before:top-1/2 pointer-coarse:before:h-11 pointer-coarse:before:w-full pointer-coarse:before:min-w-11 pointer-coarse:before:-translate-x-1/2 pointer-coarse:before:-translate-y-1/2';

/**
 * HIT_LINK for the links a slot is handed (a banner's action, a block's sources): set on the slot,
 * it reaches each link that is a direct child, so a TextLink passed in needs nothing of its own.
 */
export const HIT_LINKS =
    '[&>a]:relative pointer-coarse:[&>a]:before:absolute pointer-coarse:[&>a]:before:left-1/2 pointer-coarse:[&>a]:before:top-1/2 pointer-coarse:[&>a]:before:h-11 pointer-coarse:[&>a]:before:w-full pointer-coarse:[&>a]:before:min-w-11 pointer-coarse:[&>a]:before:-translate-x-1/2 pointer-coarse:[&>a]:before:-translate-y-1/2';
