/**
 * @orangecheck/relay-filter
 *
 * Sybil filter for Nostr relays. Reject events from pubkeys whose OrangeCheck
 * attestation doesn't meet configurable thresholds.
 *
 *   import { filterEvent } from '@orangecheck/relay-filter';
 *
 *   // On the relay's EVENT write hook:
 *   const decision = await filterEvent(event, {
 *     minSats: 100_000,
 *     minDays: 30,
 *     allowKinds: [0, 3, 10002],     // profile meta, contacts, relay list
 *     allowPubkeys: [operatorHex],   // you, always
 *   });
 *
 *   if (decision.action === 'reject') {
 *     socket.send(JSON.stringify(['OK', event.id, false, decision.message]));
 *     return;
 *   }
 *
 *   // accept — store the event
 *
 * For Strfry, use the `oc-strfry` binary (ships with this package) or import
 * from `@orangecheck/relay-filter/strfry`.
 */

export { filterEvent } from './filter';
export type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';
