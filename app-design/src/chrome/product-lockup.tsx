import { Lockup } from '../brand/mark';

/** The lockup and, after a hairline, the site's own word: "orangecheck | stamp". */
export function ProductLockup({ size, product }: { size: number; product?: string }) {
    return (
        <span className="inline-flex items-center">
            <Lockup size={size} />
            {product ? (
                <>
                    <span aria-hidden className="mx-3 h-5 w-px bg-oca-hairline-strong" />
                    <span className="font-medium tracking-[-0.01em]" style={{ fontSize: size * 0.56 }}>
                        {product}
                    </span>
                </>
            ) : null}
        </span>
    );
}
