/**
 * @orangecheck/legal — render components.
 *
 * `<LegalDocument>` turns a resolved `LegalDoc` into a page body. It renders
 * its own header, the effective/updated bar, every section, and the trailing
 * summary — so a consuming site page only supplies `<Seo>` and a container.
 * Styling uses the family's shared design tokens (`primary`, `muted-foreground`,
 * `card`, `border`, `warning`, `font-display`, `font-mono`), so the same
 * component renders natively on every .ochk.io site.
 */

import type { Block, BulletItem, LegalDoc, Section } from './types';
import { renderInline } from './markup';

function Para({ text }: { text: string }) {
    return <p className="text-muted-foreground">{renderInline(text)}</p>;
}

function SubHead({ text }: { text: string }) {
    return (
        <h3 className="font-display text-primary mt-6 mb-2 text-xs font-bold tracking-widest uppercase">
            {renderInline(text)}
        </h3>
    );
}

function Bullets({ items }: { items: BulletItem[] }) {
    return (
        <ul className="divide-y border font-mono text-xs">
            {items.map((item, i) => {
                if (typeof item === 'string') {
                    return (
                        <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                            <span className="text-primary mt-0.5 flex-shrink-0">{'>>'}</span>
                            <span className="text-muted-foreground">{renderInline(item)}</span>
                        </li>
                    );
                }
                return (
                    <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5">
                        <span className="text-primary w-40 flex-shrink-0 font-bold tracking-widest uppercase">
                            {item.k}
                        </span>
                        <span className="text-muted-foreground flex-1">{renderInline(item.v)}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function Callout({ text, emphatic }: { text: string; emphatic?: boolean }) {
    return (
        <div className="border-primary/30 bg-primary/[0.03] border px-4 py-3 font-mono text-xs leading-relaxed">
            <span className="text-primary mr-2">{emphatic ? '!! ' : '§ '}</span>
            <span className={emphatic ? 'text-foreground font-medium' : 'text-foreground'}>
                {renderInline(text)}
            </span>
        </div>
    );
}

/**
 * A section the family has not finalised. Rendered as an unmissable,
 * warning-toned notice — honest to users (these surfaces are pre-GA) and
 * impossible for whoever finalises the money/custody/SLA terms to overlook.
 */
function Stub({ text }: { text: string }) {
    return (
        <div className="border-warning/40 bg-warning/[0.05] border px-4 py-3.5 font-mono text-xs leading-relaxed">
            <div className="text-warning mb-1.5 font-bold tracking-widest uppercase">
                {'§ pending · counsel review'}
            </div>
            <p className="text-muted-foreground">{renderInline(text)}</p>
        </div>
    );
}

function BlockView({ block }: { block: Block }) {
    switch (block.kind) {
        case 'para':
            return <Para text={block.text} />;
        case 'subhead':
            return <SubHead text={block.text} />;
        case 'bullets':
            return <Bullets items={block.items} />;
        case 'callout':
            return <Callout text={block.text} emphatic={block.emphatic} />;
        case 'stub':
            return <Stub text={block.text} />;
    }
}

function SectionView({ section }: { section: Section }) {
    return (
        <section className="border-t py-10">
            <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-primary text-sm font-bold tabular-nums">
                    [{section.num}]
                </span>
                <span className="font-display text-lg font-bold tracking-wider uppercase">
                    {section.heading}
                </span>
                {section.hint && (
                    <span className="text-muted-foreground font-mono text-[11px]">
                        {'// '}
                        {section.hint}
                    </span>
                )}
            </div>
            <div className="max-w-3xl space-y-4 font-mono text-sm leading-relaxed">
                {section.blocks.map((b, i) => (
                    <BlockView key={i} block={b} />
                ))}
            </div>
        </section>
    );
}

export interface LegalDocumentProps {
    doc: LegalDoc;
}

/** Renders a complete legal document body (header → sections → summary). */
export function LegalDocument({ doc }: LegalDocumentProps) {
    return (
        <article>
            <header className="pt-2 pb-4">
                <div className="font-display text-primary mb-3 text-xs font-bold tracking-widest uppercase">
                    {'§ '}
                    {doc.eyebrow}
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                    {doc.title}
                </h1>
                <p className="text-muted-foreground mt-4 max-w-3xl text-sm leading-relaxed">
                    {renderInline(doc.description)}
                </p>
            </header>

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-b pb-4 font-mono text-[11px]">
                <span>
                    <span className="text-muted-foreground tracking-widest uppercase">
                        effective:{' '}
                    </span>
                    <span className="text-foreground tabular-nums">{doc.effective}</span>
                </span>
                <span>
                    <span className="text-muted-foreground tracking-widest uppercase">
                        last updated:{' '}
                    </span>
                    <span className="text-foreground tabular-nums">{doc.updated}</span>
                </span>
            </div>

            {doc.preamble && doc.preamble.length > 0 && (
                <div className="mt-6 space-y-3">
                    {doc.preamble.map((b, i) => (
                        <BlockView key={i} block={b} />
                    ))}
                </div>
            )}

            <div className="mt-2">
                {doc.sections.map((s) => (
                    <SectionView key={s.id} section={s} />
                ))}
            </div>

            {doc.summary && (
                <p className="text-muted-foreground mt-10 border-t pt-6 font-mono text-[11px]">
                    {'// '}
                    {doc.summary}
                </p>
            )}
        </article>
    );
}
