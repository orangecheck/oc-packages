import { useContext } from 'react';

import { sharedContext } from './shared-context';

/** Where the viewer is inside the signed-in shell: its section and page. */
export interface ShellPlace {
    section?: string;
    page?: string;
}

export const ShellContext = sharedContext<ShellPlace>('shell-place', {});

export function useShellPlace(): ShellPlace {
    return useContext(ShellContext);
}
