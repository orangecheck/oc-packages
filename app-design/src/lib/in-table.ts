import { useContext } from 'react';

import { sharedContext } from './shared-context';

/** Set by MdxTable: inline code inside it may break after punctuation, never mid-word. */
export const InTableContext = sharedContext<boolean>('in-table', false);

export function useInTable(): boolean {
    return useContext(InTableContext);
}
