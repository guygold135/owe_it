import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Surfaces React render errors instead of a blank root (common when env-dependent code throws in production).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("AppErrorBoundary", error, info.componentStack);
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      const msg = this.state.error.message;
      return (
        <div
          style={{
            padding: "1.5rem",
            fontFamily: "system-ui, sans-serif",
            maxWidth: "28rem",
            margin: "3rem auto",
            color: "#e8eaed",
            background: "#1a1d24",
            borderRadius: "12px",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", margin: "0 0 0.75rem" }}>Something went wrong</h1>
          <pre
            style={{
              fontSize: "0.8125rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: "0 0 1rem",
              opacity: 0.9,
            }}
          >
            {msg}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "none",
              background: "#30e87d",
              color: "#0f1419",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
