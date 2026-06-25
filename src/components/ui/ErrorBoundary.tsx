import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[GERSUP ErrorBoundary]', error, info)
    this.setState({ componentStack: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
          <div className="p-4 rounded-2xl bg-red-950/40 border border-red-700/40">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <div>
            <p className="text-base font-bold text-red-300 mb-1">Erro inesperado na renderização</p>
            <p className="text-sm text-surface-400 max-w-md">
              {this.state.error?.message ?? 'Ocorreu um erro desconhecido ao renderizar esta seção.'}
            </p>
            {this.state.componentStack && (
              <details className="mt-3 text-left">
                <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-300">
                  Detalhes técnicos
                </summary>
                <pre className="mt-2 text-[10px] text-surface-400 bg-surface-900 rounded-lg p-3 overflow-auto max-h-40 max-w-xl text-left whitespace-pre-wrap">
                  {this.state.componentStack}
                </pre>
              </details>
            )}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, componentStack: null })
              window.location.reload()
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700/40 hover:bg-red-600/50 text-red-200 text-sm font-semibold border border-red-700/40 transition-colors"
          >
            <RefreshCw size={14} />
            Recarregar página
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
