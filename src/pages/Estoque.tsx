import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, ChevronDown, ChevronUp, RefreshCw, Package } from 'lucide-react'
import {
  getEstoquePaginado, getEquivalentesComEstoque,
  type EstoqueRow,
} from '@/lib/api'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import { getSiTitulo } from '@/lib/utils'

const PER_PAGE = 50

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Linha expandível do MASTER ───────────────────────────────────────────────

function MasterRow({ row, expanded, onToggle }: {
  row: EstoqueRow
  expanded: boolean
  onToggle: () => void
}) {
  const [equivData, setEquivData] = useState<any[] | null>(null)
  const [loadingEquiv, setLoadingEquiv] = useState(false)
  const fetched = useRef(false)

  const totalColor =
    row.estoque_total === 0 ? 'text-red-400' :
    row.estoque_total < 5   ? 'text-amber-400' : 'text-emerald-400'

  const prod = row.produto

  const handleToggle = async () => {
    onToggle()
    if (!fetched.current) {
      fetched.current = true
      setLoadingEquiv(true)
      const res = await getEquivalentesComEstoque(row.cd_comp)
      setEquivData(res.data ?? [])
      setLoadingEquiv(false)
    }
  }

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-surface-700/30 transition-colors border-b border-surface-700/40"
        onClick={handleToggle}
      >
        <td className="px-4 py-3 font-mono text-xs text-primary-300 whitespace-nowrap">{row.cd_comp}</td>
        <td className="px-4 py-3">
          <p className="text-xs font-medium text-surface-100 line-clamp-2">{prod?.nomenclatura ?? '—'}</p>
          {prod?.cm && <p className="text-[10px] text-surface-300 font-mono mt-0.5">CM: {prod.cm}</p>}
        </td>
        <td className="px-4 py-3 text-xs text-surface-400 whitespace-nowrap">{prod?.pn ?? '—'}</td>
        <td className="px-4 py-3 text-xs text-surface-300">
          <p className="whitespace-nowrap">{prod?.nd}/{prod?.si}</p>
          {prod?.si && <p className="text-[10px] text-surface-400 truncate max-w-[150px]">{getSiTitulo(prod.si)}</p>}
        </td>
        <td className="px-4 py-3 text-right text-sm text-surface-300">{row.estoque_lib ?? 0}</td>
        <td className="px-4 py-3 text-right text-sm text-surface-400">{row.estoque_res ?? 0}</td>
        <td className={`px-4 py-3 text-right text-sm font-bold ${totalColor}`}>{row.estoque_total ?? 0}</td>
        <td className="px-4 py-3 text-center">
          {expanded
            ? <ChevronUp size={14} className="inline text-surface-400" />
            : <ChevronDown size={14} className="inline text-surface-400" />
          }
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-800/60 border-b border-surface-700/40">
          <td colSpan={8} className="px-6 py-3">
            {loadingEquiv && <p className="text-xs text-surface-400 py-2">Carregando família...</p>}
            {equivData && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
                  Família de componentes ({equivData.length})
                </p>
                {equivData.map((p: any) => {
                  const est = p.estoque
                  return (
                    <div key={p.cd_comp} className="flex items-center gap-4 text-xs py-1.5 border-b border-surface-700/30 last:border-0">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${p.pos_familia === 'MASTER' ? 'bg-primary-900/50 text-primary-300' : 'bg-surface-700 text-surface-400'}`}>
                        {p.pos_familia === 'MASTER' ? 'MST' : 'EQV'}
                      </span>
                      <span className="font-mono text-surface-400 w-28 shrink-0">{p.cd_comp}</span>
                      <span className="text-surface-300 flex-1 line-clamp-1">{p.nomenclatura}</span>
                      {est ? (
                        <span className={`font-semibold shrink-0 ${(est.estoque_total ?? 0) > 0 ? 'text-emerald-400' : 'text-surface-300'}`}>
                          {est.estoque_lib} lib / {est.estoque_res} rsv
                        </span>
                      ) : (
                        <span className="text-surface-400 shrink-0">Sem estoque</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Estoque() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<EstoqueRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const debouncedSearch = useDebounce(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getEstoquePaginado(debouncedSearch, page, PER_PAGE)
    if (res.error) {
      setError(res.error)
    } else {
      setRows(res.rows)
      setTotal(res.total)
    }
    setLoading(false)
  }, [debouncedSearch, page])

  useEffect(() => {
    setPage(0)
    setExpanded(new Set())
  }, [debouncedSearch])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-4">
      {/* Barra de busca */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por código, nomenclatura, CM ou Part Number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary !py-2 !px-3" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <Package size={14} />
          <span>
            {loading ? '...' : `${total.toLocaleString('pt-BR')} MASTER com estoque`}
          </span>
          <span className="text-surface-400">|</span>
          <span className="font-semibold text-primary-300">CAVEX</span>
        </div>
      </div>

      {error && <ErrorCard message={error} onRetry={load} />}

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['CD_COMP', 'Nomenclatura', 'PN', 'ND/SI', 'Liberado', 'Reservado', 'Total', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 bg-surface-800/60 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16">
                    <LoadingSpinner text="Buscando estoque..." />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-surface-400 text-sm">
                    Nenhum componente encontrado{search ? ` para "${search}"` : ''}.
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <MasterRow
                    key={row.cd_comp}
                    row={row}
                    expanded={expanded.has(row.cd_comp)}
                    onToggle={() => toggle(row.cd_comp)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between text-xs text-surface-400">
          <span>
            Página {page + 1} de {totalPages} — mostrando {Math.min(PER_PAGE, rows.length)} de {total.toLocaleString('pt-BR')} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !py-1.5 !px-3"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Ant.
            </button>
            {/* Páginas numéricas ao redor da atual */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5))
              const p = start + i
              return (
                <button
                  key={p}
                  className={`w-8 h-8 rounded text-xs font-medium transition-all ${p === page ? 'bg-primary-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}`}
                  onClick={() => setPage(p)}
                  disabled={loading}
                >
                  {p + 1}
                </button>
              )
            })}
            <button
              className="btn-secondary !py-1.5 !px-3"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
            >
              Próx. →
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-surface-300 px-1">
        Clique em qualquer linha para ver os componentes equivalentes da família com seus estoques individuais.
        Estoque consolidado = QTD_LIB + QTD_RSV de todos os componentes da família.
      </p>
    </div>
  )
}
