import React from 'react'

type State = { hasError: boolean; message?: string; stack?: string }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: String(error?.message ?? error), stack: String(error?.stack ?? '') }
  }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('UI ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-white text-gray-900 p-6">
          <div className="max-w-2xl mx-auto">
            <div className="text-lg font-medium mb-2">Something went wrong</div>
            <pre className="bg-gray-100 p-3 rounded-ollama overflow-auto text-sm whitespace-pre-wrap">
              {this.state.message}\n\n{this.state.stack}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


