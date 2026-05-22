import * as React from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: (error: Error, reset: () => void) => React.ReactNode;
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
        // Intentional: we swallow here. In production this would wire to
        // Sentry or similar.
        console.error('[ErrorBoundary]', error, info);
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
                                ! fatal
                            </span>
                        </div>
                        <div className="space-y-3 p-5 font-mono text-xs leading-relaxed">
                            <p>
                                <span className="text-destructive">{'> '}err:</span>{' '}
                                {this.state.error.message || 'unknown error'}
                            </p>
                            <p className="text-muted-foreground">
                                {'> '}this page crashed. reload to recover.
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
