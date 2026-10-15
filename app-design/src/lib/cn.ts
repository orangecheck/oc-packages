import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge would treat `oca-display-1` and `text-foreground` as the same
// group and drop one; teach it the package's own type utilities.
const merge = extendTailwindMerge<'oca-type'>({
    extend: {
        classGroups: {
            'oca-type': [
                'oca-display-1',
                'oca-display-2',
                'oca-display-3',
                'oca-title',
                'oca-title-sm',
                'oca-eyebrow',
                'oca-lead',
                'oca-body',
                'oca-numeral',
            ],
        },
    },
});

export function cn(...inputs: ClassValue[]): string {
    return merge(clsx(inputs));
}
