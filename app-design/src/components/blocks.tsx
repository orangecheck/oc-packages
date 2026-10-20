import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { SectionIntro } from './section';
import { Display, Eyebrow } from './typography';

/**
 * A section's title on a public page: eyebrow, headline, one line. It rises
 * into place the first time it is seen (`reveal={false}` keeps it still).
 */
export function SectionHeading({
    eyebrow,
    title,
    lead,
    id,
    onInk = false,
    level = 2,
    as = 'h2',
    align = 'start',
    reveal = true,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    lead?: ReactNode;
    /** The heading's id, for a link to the section. */
    id?: string;
    /** On an ink band: the eyebrow and lead take the ink tones. */
    onInk?: boolean;
    /** Visual size. 3 for a block inside a section. */
    level?: 2 | 3;
    as?: 'h2' | 'h3';
    align?: 'start' | 'center';
    reveal?: boolean;
    className?: string;
}) {
    return (
        <SectionIntro align={align} reveal={reveal} className={cn('max-w-3xl gap-4 md:gap-4', className)}>
            {eyebrow ? <Eyebrow onInk={onInk}>{eyebrow}</Eyebrow> : null}
            <Display level={level} as={as} id={id} className="scroll-mt-24">
                {title}
            </Display>
            {lead ? <p className={cn('oca-lead', onInk && 'text-oca-ink-muted')}>{lead}</p> : null}
        </SectionIntro>
    );
}
