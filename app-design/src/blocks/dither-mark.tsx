import { Mark } from '../brand/mark';
import { cn } from '../lib/cn';

/*
 * The isometric check as a two-tone dither, at three sizes. Until the baked
 * art lands (./art, from the OG lane's pipeline) it draws the plain mark at
 * the same size, so a page laid out around it does not move when it arrives.
 */

const WIDTH = { sm: 96, md: 192, lg: 384 } as const;

export function DitherMark({ size = 'md', title, className }: { size?: keyof typeof WIDTH; title?: string; className?: string }) {
    return (
        <span data-dither-mark={size} className={cn('inline-flex shrink-0', className)} style={{ width: WIDTH[size] }}>
            <Mark size={WIDTH[size]} title={title} className="h-auto w-full" />
        </span>
    );
}
