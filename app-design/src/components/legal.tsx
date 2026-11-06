import { Fragment, type ReactNode } from 'react';

import { DocColumns, Toc } from './contents';
import { Notice } from './data';
import { Frame, SectionBar } from './frame';
import { PageHero } from './hero';
import { TextLink } from './text-link';
import { Prose } from './typography';

/*
 * A document from @orangecheck/legal, the one source every site renders, set
 * in this system's Prose: sentence-case headings, its numbered contents beside
 * it. The shapes below are @orangecheck/legal's, written out so a LegalDoc
 * passes straight in without this package depending on that one.
 */

export type LegalBlock =
    | { kind: 'para'; text: string }
    | { kind: 'subhead'; text: string }
    | { kind: 'bullets'; items: (string | { k: string; v: string })[] }
    | { kind: 'callout'; text: string; emphatic?: boolean }
    | { kind: 'stub'; text: string };

export interface LegalSource {
    eyebrow: string;
    title: string;
    description: string;
    effective: string;
    updated: string;
    preamble?: LegalBlock[];
    sections: { id: string; num?: string; heading: string; hint?: string; blocks: LegalBlock[] }[];
    summary?: string;
}

/** Words the legal source writes in lowercase that keep their own case in a heading. */
const PROPER: Record<string, string> = {
    kyc: 'KYC',
    pii: 'PII',
    ccpa: 'CCPA',
    cpra: 'CPRA',
    gdpr: 'GDPR',
    uk: 'UK',
    eu: 'EU',
    california: 'California',
    europe: 'Europe',
    united: 'United',
    kingdom: 'Kingdom',
};

/** The source writes headings in lowercase; a heading opens with a capital, the brand as OrangeCheck only there. */
function headingCase(text: string): string {
    const words = text.replace(/\b[a-z]+\b/g, (w) => PROPER[w] ?? w);
    if (/^orangecheck\b/.test(words)) return `OrangeCheck${words.slice('orangecheck'.length)}`;
    return words.length === 0 ? words : words[0]!.toUpperCase() + words.slice(1);
}

function sentencesCase(text: string): string {
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => headingCase(s))
        .join(' ');
}

/** A sentence after a bold lead-in opens with a capital, unless it opens with a name written lowercase on purpose. */
function openSentence(text: string): string {
    const first = /^\S+/.exec(text)?.[0] ?? '';
    if (!/^[a-z][a-z'’-]*,?$/.test(first)) return text;
    return text[0]!.toUpperCase() + text.slice(1);
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/** The source's inline markup: **strong**, `code` and [label](href), split as its own renderer splits it. */
function Inline({ text }: { text: string }): ReactNode {
    return (
        <>
            {text.split(INLINE).map((part, i) => {
                if (!part) return null;
                if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                    return (
                        <strong key={i}>
                            <Inline text={part.slice(2, -2)} />
                        </strong>
                    );
                }
                if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
                const link = LINK.exec(part);
                if (link) {
                    return (
                        <TextLink key={i} href={link[2] ?? ''}>
                            {link[1]}
                        </TextLink>
                    );
                }
                return <Fragment key={i}>{part}</Fragment>;
            })}
        </>
    );
}

function BlockView({ block }: { block: LegalBlock }): ReactNode {
    switch (block.kind) {
        case 'para':
            // A block can hold several paragraphs, separated by a blank line.
            return (
                <>
                    {block.text.split(/\n{2,}/).map((para, i) => (
                        <p key={i}>
                            <Inline text={para} />
                        </p>
                    ))}
                </>
            );
        case 'subhead':
            return (
                <h3>
                    <Inline text={headingCase(block.text)} />
                </h3>
            );
        case 'bullets':
            return (
                <ul>
                    {block.items.map((item, i) =>
                        typeof item === 'string' ? (
                            <li key={i}>
                                <Inline text={item} />
                            </li>
                        ) : (
                            <li key={i}>
                                <strong>{headingCase(item.k)}.</strong> <Inline text={openSentence(item.v)} />
                            </li>
                        )
                    )}
                </ul>
            );
        case 'callout':
            return (
                <div className="not-prose my-6">
                    {/* A sentence, set as one: its links are in running text, as a paragraph's are. */}
                    <Notice tone={block.emphatic ? 'brand' : 'neutral'}>
                        <p>
                            <Inline text={block.text} />
                        </p>
                    </Notice>
                </div>
            );
        case 'stub':
            return (
                <div className="not-prose my-6">
                    <Notice tone="brand" title="Pending counsel review">
                        <p>
                            <Inline text={block.text} />
                        </p>
                    </Notice>
                </div>
            );
    }
}

/**
 * A legal document as a page: S10's header (its title's last word set back, the site's `art` at its
 * foot), its dates on a bar, its numbered contents beside its sections, each under its "§ NN", and
 * the one-line summary. The page's art is the site's: this entry draws none of its own.
 */
export function LegalDocument({ doc, art, className }: { doc: LegalSource; art?: ReactNode; className?: string }) {
    const at = doc.title.lastIndexOf(' ');
    const title =
        at > 0 ? (
            <>
                <span className="block">{doc.title.slice(0, at)}</span> <span className="block text-oca-subtle">{doc.title.slice(at + 1)}</span>
            </>
        ) : (
            doc.title
        );
    return (
        <>
            <PageHero layout="s10" size="xl" eyebrow={headingCase(doc.eyebrow)} title={title} lead={doc.description} art={art} />
            <Frame padded={false} className={className}>
                <SectionBar
                    start={
                        // One run of text: the label lays its children out side by side.
                        <span>
                            Effective <span className="whitespace-nowrap">{doc.effective}</span> · last updated <span className="whitespace-nowrap">{doc.updated}</span>
                        </span>
                    }
                />
                <DocColumns nav={<Toc entries={doc.sections.map((s) => ({ id: s.id, num: s.num, label: headingCase(s.heading) }))} />}>
                    <article className="min-w-0">
                        <Prose>
                            {doc.preamble?.map((b, i) => <BlockView key={i} block={b} />)}
                            {doc.sections.map((s) => (
                                <section key={s.id}>
                                    <h2 id={s.id} className="scroll-mt-24">
                                        {s.num ? <span className="mb-3 block font-mono text-[0.75rem] font-normal leading-[1.4] tracking-[0.08em] text-oca-accent-ink">§ {s.num}</span> : null}
                                        {headingCase(s.heading)}
                                    </h2>
                                    {s.hint ? <p className="text-[0.9375rem]">{headingCase(s.hint)}</p> : null}
                                    {s.blocks.map((b, i) => (
                                        <BlockView key={i} block={b} />
                                    ))}
                                </section>
                            ))}
                            {doc.summary ? (
                                <p className="mt-14 border-t border-border pt-6 text-[0.9375rem]">
                                    <strong>In short.</strong> {sentencesCase(doc.summary.replace(/^summary:\s*/i, ''))}
                                </p>
                            ) : null}
                        </Prose>
                    </article>
                </DocColumns>
            </Frame>
        </>
    );
}
