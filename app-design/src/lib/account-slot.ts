import { createContext, useContext } from 'react';

/**
 * Where the account control is drawn. `block`: the header's right end, the
 * bar's full height at the frame's rule (SiteHeader, ToolShell). `inline`: a
 * 44px control among others (AppShell's account slot, or before a site's own
 * CTA). `sheet`: the foot of the header's phone menu, where the signed-out
 * button goes below 480px.
 */
export interface AccountSlot {
    look: 'block' | 'inline';
    where: 'bar' | 'sheet';
}

export const AccountSlotContext = createContext<AccountSlot>({ look: 'inline', where: 'bar' });

export const useAccountSlot = () => useContext(AccountSlotContext);

/**
 * True among a header's own extras (its search, actions and the phone menu's
 * extra rows) when that header draws the account itself. A SessionAccountView
 * there draws nothing, so a site that gives the header `account` and still
 * passes its old control among the actions shows one control, not two.
 */
export const AccountTakenContext = createContext(false);

export const useAccountTaken = () => useContext(AccountTakenContext);
