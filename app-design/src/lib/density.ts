import { createElement, useContext, type ReactNode } from 'react';

import { sharedContext } from './shared-context';

/*
 * How tightly data and fields are set. A public page is `comfortable`; a
 * tool is `compact` (36px fields, 14px table text, smaller stat cards).
 * ToolShell sets it for everything inside, dialogs included (a React
 * context crosses a portal where a CSS scope would not); a prop on one
 * component still wins.
 */
export type Density = 'comfortable' | 'compact';

const DensityContext = sharedContext<Density>('density', 'comfortable');

export function DensityProvider({ density, children }: { density: Density; children: ReactNode }) {
    return createElement(DensityContext.Provider, { value: density }, children);
}

export function useDensity(): Density {
    return useContext(DensityContext);
}
