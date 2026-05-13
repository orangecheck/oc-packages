import type { ReactNode } from 'react';

/**
 * AppShell — shared page chrome for every authenticated dashboard surface
 * across the OC family (vault, me, fleet, future). Lifted from oc-me-web's
 * `MeShell` and oc-vault-web's `VaultShell` — same eyebrow / title /
 * description / actions header band, no sidebar (sidebars are app-specific
 * and stay in the consuming app).
 *
 * Usage:
 *   <AppShell eyebrow="§ vault" title="your vault." description="…">
 *     ...
 *   </AppShell>
 *
 * The component is stateless and dependency-free. Tailwind classes assume
 * the consuming site loads the family `globals.css` (which defines
 * `.container`, `.label-mono`, the dark-by-default palette, etc.).
 */

export interface AppShellProps {
    eyebrow?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
    /** Right-aligned action node rendered next to the title (e.g. CTA buttons). */
    headerActions?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function AppShell({
    eyebrow,
    title,
    description,
    headerActions,
    children,
    className,
}: AppShellProps) {
    const hasHeader = Boolean(title);
    return (
        <div className={'container ' + (className ?? '')}>
            <div className="flex min-h-[calc(100vh-3rem)] flex-col">
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="pt-6 md:pt-8">
                        {hasHeader && (
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="max-w-3xl">
                                    {eyebrow && (
                                        <div className="label-mono text-primary mb-3">
                                            {eyebrow}
                                        </div>
                                    )}
                                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                                        {title}
                                    </h1>
                                    {description && (
                                        <p className="text-muted-foreground mt-3 max-w-[64ch] text-sm leading-relaxed">
                                            {description}
                                        </p>
                                    )}
                                </div>
                                {headerActions && (
                                    <div className="flex shrink-0 items-center gap-2">
                                        {headerActions}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className={hasHeader ? 'mt-8 pb-12' : 'pb-12'}>{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
