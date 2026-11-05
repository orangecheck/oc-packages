import { Lockup } from '../brand/mark';

/**
 * The lockup, the swoosh and the wordmark, and after a hairline the site's own word:
 * "orangecheck | stamp". The one lockup in all chrome; the square app icon is the
 * favicon, the app icon and the OG mark only. Below 420px, with a product word, the
 * wordmark gives way to it. It stays in the accessible name, so the link still reads
 * "orangecheck stamp".
 */
export function ProductLockup({ size, product }: { size: number; product?: string }) {
    return (
        <span className="inline-flex min-w-0 items-center">
            <Lockup size={size} variant="flat" nameClassName={product ? 'max-[419px]:sr-only' : undefined} />
            {product ? (
                <>
                    <span aria-hidden className="mx-3 h-5 w-px shrink-0 bg-oca-hairline-strong" />
                    {/* In a crowded bar the word gives way, with an ellipsis; the mark and the rule keep their size. */}
                    <span className="min-w-0 truncate font-medium tracking-[-0.01em]" style={{ fontSize: size * 0.7 }}>
                        {product}
                    </span>
                </>
            ) : null}
        </span>
    );
}
