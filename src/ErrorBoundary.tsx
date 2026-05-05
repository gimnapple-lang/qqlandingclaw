import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          fontFamily: 'monospace',
          backgroundColor: '#fff0f0',
          color: '#333',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#cc0000' }}>🚨 渲染错误</h1>
          <p>应用发生了运行时错误：</p>
          <pre style={{ 
            backgroundColor: '#fff', 
            padding: '10px', 
            borderRadius: '5px',
            overflow: 'auto',
            maxHeight: '400px'
          }}>
            {this.state.error?.toString()}
          </pre>
          <h2>组件堆栈：</h2>
          <pre style={{ 
            backgroundColor: '#fff', 
            padding: '10px', 
            borderRadius: '5px',
            overflow: 'auto',
            maxHeight: '400px',
            fontSize: '12px'
          }}>
            {this.state.errorInfo}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: '' })}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#0099ff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
