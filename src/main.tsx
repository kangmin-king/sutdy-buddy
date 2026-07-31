import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

class SBErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Study Buddy render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 16, whiteSpace: 'pre-wrap', fontSize: 12, color: '#ba1a1a' }}>
          {String(this.state.error.stack || this.state.error.message || this.state.error)}
        </pre>
      );
    }
    return this.props.children;
  }
}

async function bootstrap() {
  try {
    const { default: App } = await import('./App');
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <SBErrorBoundary>
          <App />
        </SBErrorBoundary>
      </React.StrictMode>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    document.getElementById('root')!.innerHTML = `<pre style="padding:16px;white-space:pre-wrap;font-size:12px;color:#ba1a1a">${message}</pre>`;
  }
}

bootstrap();
