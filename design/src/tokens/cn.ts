import type { ClassValue } from 'clsx';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Canonical class-name merge for the OrangeCheck family.
 * `clsx` for conditional composition, `tailwind-merge` to resolve
 * conflicting Tailwind utilities (last-wins by property).
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
