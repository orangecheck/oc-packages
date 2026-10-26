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
