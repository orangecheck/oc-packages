"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../primitives/button";
import { EmptyState } from "./data";

interface Props {
  children: ReactNode;
  /** Changing it clears a caught error, so the next page renders afresh. Pass the route. */
  resetKey?: unknown;
  /** Told about each caught error, for logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Replaces the default message. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  failed: boolean;
  key: unknown;
}

/**
 * Keeps one broken part of a page from blanking the whole page. The default
 * says so in a sentence and offers a retry and a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: Props,
    state: State,
  ): Partial<State> | null {
    return props.resetKey === state.key
      ? null
      : { failed: false, key: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => this.setState({ failed: false });

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="oca-container py-16">
        <EmptyState
          title="Something on this page broke."
          action={
            <>
              <Button onClick={this.reset}>Try again</Button>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Reload the page
              </Button>
            </>
          }
        >
          Nothing you saved is affected. If it keeps happening, tell us at
          hello@ochk.io.
        </EmptyState>
      </div>
    );
  }
}
