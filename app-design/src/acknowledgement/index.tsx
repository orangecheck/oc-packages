import { cn } from '../lib/cn';

/**
 * The credit a family landing page carries in its closing section: Bram
 * Kanstein, for the lineage of Bitcoin as a sovereignty layer the family
 * builds on. Its own entry, so a site opts in by importing it and nothing
 * else carries the name: ochk.app names him nowhere, by the owner's decision,
 * and its test refuses this import. Put it in Closing's `fineprint`.
 */
export function Acknowledgement({ onBrand = false, className }: { onBrand?: boolean; className?: string }) {
    return (
        <p
            className={cn(
                // 52ch in em: the fallback's 0, and so its ch, is 6% narrower than Inter's.
                'max-w-[32.7em] text-[0.875rem] leading-relaxed',
                onBrand ? 'text-brand-foreground' : 'text-muted-foreground',
                className
            )}
        >
            With thanks to{' '}
            <a
                href="https://bramk.substack.com/"
                target="_blank"
                rel="noreferrer"
                className={cn(
                    'underline underline-offset-4 transition-colors',
                    onBrand ? 'decoration-brand-foreground/50 hover:decoration-brand-foreground' : 'decoration-foreground/35 hover:text-foreground'
                )}
            >
                Bram Kanstein
                <span className="sr-only"> (opens in a new tab)</span>
            </a>
            , whose work on Bitcoin as a sovereignty layer shaped the premise.
        </p>
    );
}
