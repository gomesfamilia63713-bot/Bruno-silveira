import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { recoverFromModuleLoadError } from "@/lib/module-recovery";

type Props = { children: React.ReactNode; label?: string; fallback?: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info);
    void recoverFromModuleLoadError(error);
  }
  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            Falha ao carregar{this.props.label ? `: ${this.props.label}` : ""}.
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" /> Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
