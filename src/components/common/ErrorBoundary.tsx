import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AgentPro] 页面渲染失败", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-0 flex-1 place-items-center bg-agent-bg px-6">
        <div className="w-full max-w-[560px] rounded-2xl border border-orange-200 bg-white p-7 shadow-agent">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-500">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-lg font-bold text-agent-ink">页面渲染异常</div>
              <div className="text-sm text-agent-muted">应用没有崩溃，当前页面遇到了无法渲染的数据。</div>
            </div>
          </div>
          <pre className="max-h-[160px] overflow-auto rounded-xl bg-agent-bg p-4 text-xs leading-6 text-agent-secondary">
            {this.state.error.message}
          </pre>
          <button
            className="mt-5 rounded-xl bg-agent-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-agent-primaryHover"
            type="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            返回需求库
          </button>
        </div>
      </div>
    );
  }
}
