import { Children, type AnchorHTMLAttributes, type HTMLAttributes, type ImgHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

import { CodeBlock, CodeTabs, InstallTabs } from '../components/code-block';
import {
    ApiTable,
    Callout,
    CardGrid,
    codeLang,
    codeText,
    Diagram,
    DocsHeading,
    LinkCard,
    MdxTable,
    Step,
    Steps,
    type MermaidLoader,
} from '../components/docs';
import { ProtocolGrid } from '../components/family-grids';
import { SpecCard } from '../components/protocol';
import { TextLink } from '../components/text-link';
import { cn } from '../lib/cn';
import { useInTable } from '../lib/in-table';
import { StatusBadge } from '../primitives/status-badge';

/** A break opportunity after each punctuation mark in a token, so it wraps there rather than mid-word. */
function breakAfterPunctuation(children: ReactNode): ReactNode {
    return Children.map(children, (c) => {
        if (typeof c !== 'string') return c;
        const parts = c.split(/(?<=[_./:?&=#,@(-])(?=\S)/);
        return parts.length < 2 ? c : parts.flatMap((p, i) => (i === 0 ? [p] : [<wbr key={i} />, p]));
    });
}

function InlineCode({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
    const inTable = useInTable();
    return (
        <code className={cn('break-words rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground', className)} {...props}>
            {inTable ? breakAfterPunctuation(children) : children}
        </code>
    );
}

/*
 * Markdown in the system's type: hand the map to MDX (useMDXComponents or
 * <MDXProvider components>) and every heading, paragraph, list, table,
 * quote and code fence takes its place. Pair it with rehypeCode (./code) so
 * fences arrive highlighted from the build; without it, a fence is
 * highlighted when the page renders.
 *
 * The blocks a page writes by name are in the map too: Callout, Steps and
 * Step, LinkCard and CardGrid, ApiTable, CodeTabs, InstallTabs, SpecCard,
 * ProtocolGrid, StatusBadge.
 */


export interface MdxOptions {
    /** `() => import('mermaid')`: draws ```mermaid fences as diagrams. Without it they show as code. */
    mermaid?: MermaidLoader;
}

type PreProps = HTMLAttributes<HTMLPreElement> & {
    'data-oca-code'?: string;
    'data-html'?: string;
    'data-lang'?: string;
    'data-title'?: string;
    'data-diff'?: string;
    'data-line-numbers'?: string;
    'data-eol'?: string;
    /** A mermaid fence's `size=834x623`, carried by rehypeCode. */
    'data-size'?: string;
};

function sizeOf(meta: string | undefined): readonly [number, number] | undefined {
    const m = meta?.match(/^(\d+)x(\d+)$/);
    return m ? [Number(m[1]), Number(m[2])] : undefined;
}

export function createMdxComponents({ mermaid }: MdxOptions = {}) {
    function Pre(props: PreProps) {
        // Highlighted at build time by rehypeCode.
        if (props['data-oca-code'] !== undefined) {
            return (
                <CodeBlock
                    html={props['data-html'] ?? ''}
                    lang={props['data-lang']}
                    caption={props['data-title']}
                    diff={props['data-diff'] !== undefined}
                    lineNumbers={props['data-line-numbers'] !== undefined}
                    trailingNewline={props['data-eol'] !== undefined}
                    className="my-6"
                />
            );
        }
        const lang = codeLang(props.children);
        const code = codeText(props.children);
        if (lang === 'mermaid' && mermaid) return <Diagram chart={code} load={mermaid} size={sizeOf(props['data-size'])} />;
        return (
            <CodeBlock
                code={code}
                lang={lang === 'mermaid' ? undefined : lang}
                caption={lang === 'mermaid' ? 'Diagram source' : undefined}
                className="my-6"
            />
        );
    }

    function A({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
        // In-page anchors and footnote links stay plain.
        if (!href || href.startsWith('#')) {
            return (
                <a href={href} {...rest} className="text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground">
                    {children}
                </a>
            );
        }
        return <TextLink href={href}>{children}</TextLink>;
    }

    const heading = (as: 'h1' | 'h2' | 'h3' | 'h4') =>
        function Heading(props: HTMLAttributes<HTMLHeadingElement>) {
            return <DocsHeading as={as} {...props} />;
        };

    // TypeDoc writes h5 for a method's "Returns": a label over what follows, not a section.
    const minor = (Tag: 'h5' | 'h6') =>
        function Minor({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
            return <Tag className={cn('mb-2 mt-6 scroll-mt-28 text-[0.9375rem] font-medium leading-snug text-foreground', className)} {...props} />;
        };

    return {
        h1: heading('h1'),
        h2: heading('h2'),
        h3: heading('h3'),
        h4: heading('h4'),
        p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
            <p className={cn('my-4 text-[1rem] leading-[1.75] text-muted-foreground md:text-[1.0625rem]', className)} {...props} />
        ),
        a: A,
        strong: (props: HTMLAttributes<HTMLElement>) => <strong className="font-medium text-foreground" {...props} />,
        h5: minor('h5'),
        h6: minor('h6'),
        ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
            <ul
                className={cn(
                    'my-4 list-disc space-y-1.5 pl-5 text-[1rem] leading-[1.7] text-muted-foreground marker:text-oca-subtle md:text-[1.0625rem]',
                    // A GitHub task list: the box replaces the bullet.
                    className?.includes('contains-task-list') && 'list-none pl-0',
                    className
                )}
                {...props}
            />
        ),
        ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
            <ol
                className={cn(
                    'my-4 list-decimal space-y-1.5 pl-5 text-[1rem] leading-[1.7] text-muted-foreground marker:text-oca-subtle md:text-[1.0625rem]',
                    className
                )}
                {...props}
            />
        ),
        li: ({ className, ...props }: HTMLAttributes<HTMLLIElement>) => (
            <li
                className={cn(
                    'pl-1 [&>p]:my-1 [&>ul]:my-1.5 [&>ol]:my-1.5',
                    // A wrapped task starts under its text, not under the box.
                    className?.includes('task-list-item') && 'pl-6 -indent-6',
                    className
                )}
                {...props}
            />
        ),
        input: (props: InputHTMLAttributes<HTMLInputElement>) =>
            props.type === 'checkbox' ? (
                <input
                    {...props}
                    className={cn('mr-2 size-4 translate-y-[2px] align-baseline accent-foreground', props.className)}
                    aria-label={props.checked ? 'Done' : 'To do'}
                />
            ) : (
                <input {...props} />
            ),
        blockquote: ({ children }: { children?: ReactNode }) => <Callout>{children}</Callout>,
        hr: () => <hr className="my-10 border-border" />,
        table: MdxTable,
        code: InlineCode,
        pre: Pre,
        img: ({ className, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
            <img alt={alt} loading="lazy" className={cn('my-6 h-auto max-w-full rounded-2xl border border-border', className)} {...props} />
        ),
        Callout,
        Steps,
        Step,
        LinkCard,
        CardGrid,
        ApiTable,
        CodeBlock,
        CodeTabs,
        InstallTabs,
        SpecCard,
        ProtocolGrid,
        StatusBadge,
        ...(mermaid
            ? { Diagram: (p: { chart: string; caption?: ReactNode }) => <Diagram {...p} load={mermaid} /> }
            : {}),
    };
}

/** Every key it maps, each a component: what MDX's useMDXComponents takes. */
export type MdxComponentMap = ReturnType<typeof createMdxComponents>;

/** The map with no diagrams; createMdxComponents({ mermaid }) draws them. */
export const mdxComponents: MdxComponentMap = createMdxComponents();
