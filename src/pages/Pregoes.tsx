import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, RefreshCw } from 'lucide-react'
import { useQuery } from '@/hooks/useQuery'
import { getPregoes } from '@/lib/api'
import { enrichPregao, formatCurrency, formatDate, formatPercent, cn } from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import ModalImportarPncp from '@/components/pregoes/ModalImportarPncp'
import ModalAtualizarTodos from '@/components/pregoes/ModalAtualizarTodos'

const STATUS_LABEL: Record<string, string> = { ATIVO: 'Ativo', A_VENCER: 'A Vencer', VENCIDO: 'Vencido' }
const STATUS_CLASS: Record<string, string> = { ATIVO: 'badge-ativo', A_VENCER: 'badge-avencer', VENCIDO: 'badge-vencido' }

export default function Pregoes() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')
  const [modalAberto, setModalAberto] = useState(false)
  const [modalAtualizarTodosAberto, setModalAtualizarTodosAberto] = useState(false)

  const { data, loading, error, refetch } = useQuery(getPregoes)

  const cards = useMemo(() => (data ?? []).map(enrichPregao), [data])

  const idsParaAtualizar = useMemo(() => {
    return cards.map(c => c.id_pncp_compra).filter(Boolean) as string[]
  }, [cards])

  const filtered = useMemo(() => cards.filter(c => {
    const matchSearch = !search ||
      c.numero_pregao.toLowerCase().includes(search.toLowerCase()) ||
      c.objeto.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filtroStatus === 'TODOS' || c.status === filtroStatus
    return matchSearch && matchStatus
  }), [cards, search, filtroStatus])

  if (error) return <ErrorCard message={error} onRetry={refetch} />

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input className="input pl-9" placeholder="Buscar pregão..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            {['TODOS', 'ATIVO', 'A_VENCER', 'VENCIDO'].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  filtroStatus === s
                    ? 'bg-primary-600 border-primary-500 text-white'
                    : 'bg-surface-700 border-surface-600 text-surface-200 hover:text-white'
                )}>
                {s === 'TODOS' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <span className="text-xs text-surface-300">{filtered.length} pregão(s)</span>

          <div className="flex gap-2 ml-auto">
            {idsParaAtualizar.length > 0 && (
              <button
                onClick={() => setModalAtualizarTodosAberto(true)}
                className="btn-secondary"
                title="Atualizar todos os pregões com dados recentes do PNCP"
              >
                <RefreshCw size={15} />
                Atualizar Todos
              </button>
            )}
            {/* Botão de importação PNCP */}
            <button
              id="btn-adicionar-pregao"
              onClick={() => setModalAberto(true)}
              className="btn-primary"
            >
              <Plus size={15} />
              Adicionar / Atualizar Pregão
            </button>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="py-12">
              <LoadingSpinner text="Carregando pregões..." />
            </div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Pregão / ATA</th><th>Objeto</th><th>Validade</th><th>Status</th>
                  <th className="text-right">Valor Total</th><th className="text-right">Empenhado</th>
                  <th className="text-right">Saldo</th><th className="text-center">Itens</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => (
                  <tr key={card.id} className="cursor-pointer" onClick={() => navigate(`/pregoes/${card.id}`)}>
                    <td className="font-mono text-xs text-primary-300">{card.numero_pregao}</td>
                    <td className="max-w-xs"><p className="line-clamp-2 text-xs">{card.objeto}</p></td>
                    <td className={cn('text-xs', card.status === 'VENCIDO' ? 'text-red-400' : card.status === 'A_VENCER' ? 'text-amber-400' : '')}>{formatDate(card.data_vencimento)}</td>
                    <td><span className={STATUS_CLASS[card.status]}>{STATUS_LABEL[card.status]}</span></td>
                    <td className="text-right text-xs">{formatCurrency(card.valor_total)}</td>
                    <td className="text-right text-xs">{formatPercent(card.percentual_empenhado)}</td>
                    <td className={cn('text-right text-xs font-semibold', card.saldo_disponivel <= 0 ? 'text-red-400' : 'text-emerald-400')}>{formatCurrency(card.saldo_disponivel)}</td>
                    <td className="text-center text-xs">{card.quantidade_itens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filtered.length === 0 && !loading && (
            <div className="py-16 text-center space-y-3">
              <p className="text-surface-300 text-sm">Nenhum pregão cadastrado.</p>
              <p className="text-surface-400 text-xs">Clique em <strong className="text-primary-300">Adicionar / Atualizar Pregão</strong> para importar dados via PNCP.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de importação */}
      {modalAberto && (
        <ModalImportarPncp
          onClose={() => setModalAberto(false)}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {/* Modal atualizar todos */}
      {modalAtualizarTodosAberto && (
        <ModalAtualizarTodos
          idsParaAtualizar={idsParaAtualizar}
          onClose={() => setModalAtualizarTodosAberto(false)}
          onSuccess={() => {
            refetch()
          }}
        />
      )}
    </>
  )
}
