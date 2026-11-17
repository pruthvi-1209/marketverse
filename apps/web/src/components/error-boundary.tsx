import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps the app shell (sidebar + header) alive when a page throws during render.
 * Resets automatically when the parent gives the boundary a new key (route change).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("Route render failed:", error);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="notice error" role="alert">
          <strong>This page failed to render.</strong>
          <p style={{ marginTop: 6, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {this.state.error.message}
          </p>
          <button className="btn-ghost" style={{ marginTop: 12 }} onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
