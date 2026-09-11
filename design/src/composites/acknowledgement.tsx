import { cn } from '../tokens/cn';

/**
 * Acknowledgement — the credit line every landing page carries in its
 * bottom-CTA section, crediting Bram Kanstein for the "Bitcoin as sovereignty
 * layer" lineage the whole family is built on.
 *
 * It is a component rather than seven copies of a `<p>` because it was seven
 * different things: four sites had no credit at all, and the three that did
 * disagreed on wording, placement and weight — one in the hero as a bare icon
 * link, one in the footer at 10px and 40% opacity. An attribution that is
 * technically present but unreadable is not an attribution.
 *
 * `tone="onBrand"` for the usual case: a bottom CTA sits on a BrandBand.
 */

export interface AcknowledgementProps {
    /** Match the surface it sits on. A bottom CTA is normally a BrandBand. */
    tone?: 'default' | 'onBrand';
    className?: string;
}

export const ACKNOWLEDGEMENT_URL = 'https://bramk.substack.com/';
export const ACKNOWLEDGEMENT_NAME = 'bram kanstein';

export function Acknowledgement({ tone = 'default', className }: AcknowledgementProps) {
    const onBrand = tone === 'onBrand';
    return (
        <p
            className={cn(
                'mx-auto max-w-[52ch] font-mono text-xs leading-relaxed',
                onBrand ? 'text-brand-foreground/70' : 'text-muted-foreground',
                className,
            )}
        >
            with thanks to{' '}
            <a
                href={ACKNOWLEDGEMENT_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                    'underline decoration-dotted underline-offset-2 transition-colors',
                    onBrand ? 'hover:text-brand-foreground' : 'hover:text-foreground',
                )}
            >
                {ACKNOWLEDGEMENT_NAME}
            </a>{' '}
            — whose work on bitcoin as sovereignty layer shaped the premise.
        </p>
    );
}
