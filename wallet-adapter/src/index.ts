/**
 * @orangecheck/wallet-adapter
 *
 * Normalize browser Bitcoin wallets behind a single `sign(message)` API.
 *
 *   import { getSigner, detectWallets } from '@orangecheck/wallet-adapter';
 *
 *   const wallets = detectWallets();                  // which wallets are installed?
 *   const sign    = getSigner('unisat', { address }); // get a SignFn
 *   const sig     = await sign(challenge.message);    // one-liner to get a BIP-322 sig
 *
 * Pairs cleanly with `<OcChallengeButton sign={sign}>` from @orangecheck/react.
 *
 * For a pre-built React UI that detects installed wallets and lets the user
 * pick one, import from `@orangecheck/wallet-adapter/react`:
 *
 *   import { OcWalletButton } from '@orangecheck/wallet-adapter/react';
 */

export { detectWallets, isWalletDetected } from './detect';
export { getSigner } from './sign';
export type { SignFn, SignOptions, WalletId, WalletInfo } from './types';
