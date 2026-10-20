import { useContext } from 'react';

import { sharedContext } from './shared-context';

/** Set by a shell that already draws the content column and its gutter: a block inside adds none of its own. */
export const InColumnContext = sharedContext<boolean>('in-column', false);

export function useInColumn(): boolean {
    return useContext(InColumnContext);
}
