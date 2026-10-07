import * as React from 'react';

interface Props {
    children: React.ReactNode;
    /** Full custom fallback. Takes precedence over `title`/`message`. */
    fallback?: (error: Error, reset: () => void) => React.ReactNode;
    /** Title shown in the default fallback's terminal strip (default "something went wrong"). */
    title?: string;
    /** The line telling the user what to do (default "this page hit an error. reload to try again."). */
    message?: string;
    /** Called on catch — wire to Sentry/analytics. Runs alongside the console log. */
    onError?: (error: Error, info: React.ErrorInfo) => void;
}

// Read NODE_ENV without depending on @types/node (this is a browser package).
const NODE_ENV = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;

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
                                {this.props.title ?? 'something went wrong'}
                            </span>
                        </div>
                        <div className="space-y-3 p-5 font-mono text-xs leading-relaxed">
                            <p>{this.props.message ?? 'this page hit an error. reload to try again.'}</p>
                            {/* The raw message is for developers only. Unknown env counts as production. */}
                            {NODE_ENV === 'development' && (
                                <p className="text-muted-foreground break-words">
                                    {'> '}
                                    {this.state.error.message || 'unknown error'}
                                </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 font-mono text-xs tracking-widest uppercase max-md:min-h-11"
                                >
                                    reload
                                </button>
                                <a
                                    href="/"
                                    className="hover:bg-accent inline-flex h-9 items-center justify-center rounded-md border px-4 font-mono text-xs tracking-widest uppercase max-md:min-h-11"
                                >
                                    home
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
