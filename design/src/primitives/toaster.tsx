'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Toast host in the house design language. Mount once at the app root, then
 * call `toast()` from `sonner` anywhere. Re-exported here for convenience.
 */
const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
                    description: 'group-[.toast]:text-muted-foreground',
                    actionButton: 'group-[.toast]:bg-foreground group-[.toast]:text-background',
                    cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
                    error: 'group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border',
                    success:
                        'group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border',
                    warning:
                        'group-[.toaster]:!bg-card group-[.toaster]:!text-foreground group-[.toaster]:!border-border',
                    info: 'group-[.toaster]:!bg-card group-[.toaster]:!text-muted-foreground group-[.toaster]:!border-border',
                },
            }}
            style={
                {
                    '--normal-bg': 'var(--card)',
                    '--normal-text': 'var(--card-foreground)',
                    '--normal-border': 'var(--border)',
                    '--error-bg': 'var(--card)',
                    '--error-text': 'var(--foreground)',
                    '--error-border': 'var(--border)',
                    '--success-bg': 'var(--card)',
                    '--success-text': 'var(--foreground)',
                    '--success-border': 'var(--border)',
                    '--warning-bg': 'var(--card)',
                    '--warning-text': 'var(--foreground)',
                    '--warning-border': 'var(--border)',
                    '--info-bg': 'var(--card)',
                    '--info-text': 'var(--muted-foreground)',
                    '--info-border': 'var(--border)',
                } as React.CSSProperties
            }
            {...props}
        />
    );
};

export { Toaster };
