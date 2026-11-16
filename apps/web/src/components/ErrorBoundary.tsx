import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 应用级渲染兜底：第三方组件、浏览器能力或异常数据导致渲染失败时，
 * 保留一个可操作的恢复界面，而不是让 Tauri/WebView 只剩白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 不上传错误；仅保留本地控制台诊断信息。
    console.error('[audio-studio] render error', error, info.componentStack);
  }

  private recover = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main
        className="page-scroll"
        role="alert"
        aria-live="assertive"
        style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}
      >
        <section className="card" style={{ maxWidth: 560, width: '100%' }}>
          <h1 style={{ marginTop: 0 }}>Audio Studio 遇到异常</h1>
          <p className="secondary">
            页面组件发生错误，音频文件不会上传。可以先重试当前界面；如果问题持续，请刷新应用。
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={this.recover}>
              重试
            </button>
            <button className="btn" onClick={this.reload}>
              刷新应用
            </button>
          </div>
          <details className="mt-3">
            <summary className="small">显示诊断信息</summary>
            <pre className="mono xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {this.state.error.message}
            </pre>
          </details>
        </section>
      </main>
    );
  }
}
