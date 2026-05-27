import * as React from 'react';

interface Props {
    children: React.ReactNode;
    /** Full custom fallback. Takes precedence over `title`/`message`. */
    fallback?: (error: Error, reset: () => void) => React.ReactNode;
    /** Title shown in the default fallback's terminal strip (default "! fatal"). */
    title?: string;
    /** Reassurance line below the error (default "this page crashed. reload to recover."). */
    message?: string;
    /** Called on catch — wire to Sentry/analytics. Runs alongside the console log. */
    onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // Default behaviour logs; pass `onError` to forward to Sentry or similar.
        console.error('[ErrorBoundary]', error, info);
        this.props.onError?.(error, info);
    }

    reset = () => this.setState({ error: null });

    render() {
        if (this.state.error) {
            if (this.props.fallback) {
                return this.props.fallback(this.state.error, this.reset);
            }
            return (
                <div className="container py-16">
                    <div className="terminal">
                        <div className="terminal-title">
                            <span className="text-destructive flex items-center gap-1.5">
                                {this.props.title ?? '! fatal'}
                            </span>
                        </div>
                        <div className="space-y-3 p-5 font-mono text-xs leading-relaxed">
                            <p>
                                <span className="text-destructive">{'> '}err:</span>{' '}
                                {this.state.error.message || 'unknown error'}
                            </p>
                            <p className="text-muted-foreground">
                                {'> '}
                                {this.props.message ?? 'this page crashed. reload to recover.'}
                            </p>
                            <button
                                type="button"
                                onClick={this.reset}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-mono text-xs tracking-widest uppercase"
                            >
                                retry
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
