import { useContext } from 'react';

import { sharedContext } from './shared-context';

/** Set by ToolShell: where "home" is on a tool site, the protocol's page on ochk.io. Its own `/` redirects off-site. */
export const SiteHomeContext = sharedContext<string | undefined>('site-home', undefined);

export function useSiteHome(): string | undefined {
    return useContext(SiteHomeContext);
}
