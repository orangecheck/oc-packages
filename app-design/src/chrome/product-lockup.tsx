import { Lockup } from '../brand/mark';

/**
 * The lockup and, after a hairline, the site's own word: "orangecheck | stamp".
 * Below 420px, with a product word, the wordmark gives way to it: "✓ | stamp".
 * It stays in the accessible name, so the link still reads "orangecheck stamp".
 */
export function ProductLockup({ size, product, flat = false }: { size: number; product?: string; flat?: boolean }) {
    return (
        <span className="inline-flex items-center">
            <Lockup size={size} variant={flat ? 'flat' : 'icon'} nameClassName={product ? 'max-[419px]:sr-only' : undefined} />
            {product ? (
                <>
                    <span aria-hidden className="mx-3 h-5 w-px bg-oca-hairline-strong" />
                    <span className="font-medium tracking-[-0.01em]" style={{ fontSize: size * (flat ? 0.7 : 0.56) }}>
                        {product}
                    </span>
                </>
            ) : null}
        </span>
    );
}
