import { Lockup } from '../brand/mark';

/** The lockup and, after a hairline, the site's own word: "orangecheck | stamp". */
export function ProductLockup({ size, product, flat = false }: { size: number; product?: string; flat?: boolean }) {
    return (
        <span className="inline-flex items-center">
            <Lockup size={size} variant={flat ? 'flat' : 'icon'} />
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
