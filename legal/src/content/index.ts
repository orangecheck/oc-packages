/** @orangecheck/legal — profile registry consumed by `buildDoc`. */

import type { DocKind, DocSpec, LegalProfile } from '../types';
import { protocolProfile } from './protocol';
import { meProfile } from './me';
import { vaultProfile } from './vault';
import { fleetProfile } from './fleet';

export const PROFILES: Record<LegalProfile, Record<DocKind, DocSpec>> = {
    protocol: protocolProfile,
    me: meProfile,
    vault: vaultProfile,
    fleet: fleetProfile,
};
