import { createContext, useContext } from 'react';

/** Where the viewer is inside the signed-in shell: its section and page. */
export interface ShellPlace {
    section?: string;
    page?: string;
}

export const ShellContext = createContext<ShellPlace>({});

export function useShellPlace(): ShellPlace {
    return useContext(ShellContext);
}
