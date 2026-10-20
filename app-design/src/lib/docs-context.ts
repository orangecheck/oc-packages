import { useContext } from 'react';

import { sharedContext } from './shared-context';

/** Set by DocsShell: inside the docs, a link to the docs is a page of this site, through the router. */
export const InDocsContext = sharedContext<boolean>('in-docs', false);

export function useInDocs(): boolean {
    return useContext(InDocsContext);
}
