import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'

export function LoadingSpinner({ text = 'Carregando...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-surface-400">
      <Loader2 size={28} className="animate-spin text-primary-400" />
      <span className="text-sm">{text}</span>
    </div>
  )
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 py-12 text-center">
      <AlertCircle size={32} className="text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-300">Erro ao carregar dados</p>
        <p className="text-xs text-surface-400 mt-1 max-w-md">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-secondary !py-1.5" onClick={onRetry}>
          <RefreshCw size={14} /> Tentar novamente
        </button>
      )}
    </div>
  )
}

export function EmptyState({ text = 'Nenhum dado encontrado.' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-surface-400">
      <p className="text-sm">{text}</p>
    </div>
  )
}
