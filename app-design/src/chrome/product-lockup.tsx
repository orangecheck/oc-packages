import { Lockup } from '../brand/mark';
import { cn } from '../lib/cn';

/**
 * The lockup, the swoosh and the wordmark, and after a hairline the site's own word:
 * "orangecheck | stamp". The one lockup in all chrome; the square app icon is the
 * favicon, the app icon and the OG mark only. Below 420px, with a product word, the
 * wordmark gives way to it. It stays in the accessible name, so the link still reads
 * "orangecheck stamp".
 *
 * `compact`, in SiteHeader's and AppShell's bars: with someone signed in, a
 * phone's bar gives their name the room. Below 480px the lockup drops the
 * wordmark, so orangecheck's own (ochk.io, the docs) is its mark alone, and
 * below 390px a site's is its mark alone too. Signed out it is drawn as above.
 */
export function ProductLockup({ size, product, compact = false }: { size: number; product?: string; compact?: boolean }) {
    return (
        <span className="inline-flex min-w-0 items-center">
            <Lockup
                size={size}
                variant="flat"
                nameClassName={
                    cn(
                        product && 'max-[419px]:sr-only',
                        compact && 'max-[479px]:group-has-[[data-oca-account=in]]/bar:sr-only'
                    ) || undefined
                }
            />
            {product ? (
                <>
                    <span aria-hidden className={cn('mx-3 h-5 w-px shrink-0 bg-oca-hairline-strong', compact && 'max-[389px]:group-has-[[data-oca-account=in]]/bar:hidden')} />
                    {/* In a crowded bar the word gives way, with an ellipsis; the mark and the rule keep their size. */}
                    <span
                        className={cn('min-w-0 truncate font-medium tracking-[-0.01em]', compact && 'max-[389px]:group-has-[[data-oca-account=in]]/bar:sr-only')}
                        style={{ fontSize: size * 0.7 }}
                    >
                        {product}
                    </span>
                </>
            ) : null}
        </span>
    );
}
