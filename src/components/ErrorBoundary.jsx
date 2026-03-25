import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-stone-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-stone-500 mb-6">This page ran into a problem. Your data is safe.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-emerald-700 text-white text-sm font-medium rounded-xl hover:bg-emerald-800 transition-colors"
            >
              Reload page
            </button>
            <a
              href="/"
              className="px-4 py-2.5 bg-stone-100 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-200 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}
