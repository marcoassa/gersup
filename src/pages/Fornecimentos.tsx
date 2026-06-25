import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, RefreshCw, ChevronDown, ChevronUp, History, FileSpreadsheet } from 'lucide-react'
import {
  getFornecimentosPaginado, getFornecimentosByMaster, getAllFornecimentosMasterReport,
  type MasterConsumoRow,
} from '@/lib/api'
import * as xlsx from 'xlsx'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import { formatDate, getSiTitulo } from '@/lib/utils'

const PER_PAGE = 40

// Últimos 5 anos dinamicamente
const ANOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 4 + i)

function useDebounce<T>(value: T, delay = 400): T {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return d
}

// ─── Linha com expansão de detalhes ──────────────────────────────────────────

function MasterConsumoLine({ row, expanded, onToggle }: {
  row: MasterConsumoRow
  expanded: boolean
  onToggle: () => void
}) {
  const [detalhes, setDetalhes] = useState<any[] | null>(null)
  const [loadingDet, setLoadingDet] = useState(false)
  const fetched = useRef(false)

  const handleToggle = async () => {
    onToggle()
    if (!fetched.current) {
      fetched.current = true
      setLoadingDet(true)
      const { data } = await getFornecimentosByMaster(row.cdComp)
      setDetalhes(data ?? [])
      setLoadingDet(false)
    }
  }

  const temConsumo = row.anosComConsumo > 0

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-surface-700/30 transition-colors border-b border-surface-700/40"
        onClick={handleToggle}
      >
        <td className="px-4 py-3">
          <p className="font-mono text-xs text-primary-300">{row.cdComp}</p>
          <p className="text-xs text-surface-200">{row.nomenclatura}</p>
          <p className="text-[10px] text-surface-300">
            ND {row.nd} / SI {row.si}
            {row.si && <span className="text-surface-400 block">{getSiTitulo(row.si)}</span>}
          </p>
        </td>
        {ANOS.map(ano => {
          const q = row.consumoPorAno[ano] ?? 0
          return (
            <td key={ano} className={`px-3 py-3 text-right text-xs tabular-nums ${q > 0 ? 'text-surface-100 font-semibold' : 'text-surface-400'}`}>
              {q > 0 ? q.toLocaleString('pt-BR') : '—'}
            </td>
          )
        })}
        <td className="px-3 py-3 text-right text-xs text-surface-400 tabular-nums">
          {temConsumo ? row.mediaSimples.toFixed(1) : '—'}
        </td>
        <td className="px-3 py-3 text-right text-xs font-semibold text-primary-300 tabular-nums">
          {temConsumo ? row.mediaPonderada.toFixed(1) : '—'}
        </td>
        <td className="px-3 py-3 text-right text-xs font-semibold text-emerald-400 tabular-nums">
          {temConsumo ? row.mediaMensal.toFixed(2) : '—'}
        </td>
        <td className="px-3 py-3 text-center">
          {expanded
            ? <ChevronUp size={13} className="inline text-surface-400" />
            : <ChevronDown size={13} className="inline text-surface-400" />
          }
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-800/60 border-b border-surface-700/40">
          <td colSpan={ANOS.length + 5} className="px-6 py-3">
            {loadingDet && <p className="text-xs text-surface-400 py-1">Carregando registros...</p>}
            {detalhes !== null && (
              <>
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
                  Fornecimentos individuais da família ({detalhes.length})
                </p>
                {detalhes.length === 0 ? (
                  <p className="text-xs text-surface-300">Nenhum fornecimento registrado.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                    {detalhes.map((f, i) => (
                      <div key={i} className="flex items-center gap-4 text-xs py-1 border-b border-surface-700/30 last:border-0">
                        <span className="font-mono text-surface-400 w-28 shrink-0">{f.cd_comp}</span>
                        <span className="text-surface-300 w-24 shrink-0">{f.data ? formatDate(f.data) : f.ano}</span>
                        <span className="text-surface-400 flex-1 truncate">{f.solicitante ?? '—'}</span>
                        <span className="font-semibold text-surface-100 shrink-0">{Number(f.quantidade).toLocaleString('pt-BR')} un</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Fornecimentos() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<MasterConsumoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  const handleExportXlsx = async () => {
    setExporting(true)
    setError(null)
    try {
      const res = await getAllFornecimentosMasterReport()
      if (res.error) {
        setError(`Erro ao gerar relatório: ${res.error}`)
        setExporting(false)
        return
      }

      const reportRows = res.data ?? []

      const exportData = reportRows.map(r => {
        const rowData: Record<string, any> = {
          'Código COMP': r.cdComp,
          'Nomenclatura': r.nomenclatura,
          'ND': r.nd ?? '',
          'SI': r.si ?? '',
        }

        ANOS.forEach(a => {
          rowData[String(a)] = r.consumoPorAno[a] ?? 0
        })

        rowData['Média Simples'] = Number(r.mediaSimples.toFixed(2))
        rowData['Média Ponderada'] = Number(r.mediaPonderada.toFixed(2))
        rowData['Média Mensal'] = Number(r.mediaMensal.toFixed(2))

        return rowData
      })

      const worksheet = xlsx.utils.json_to_sheet(exportData)
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Fornecimentos Master')

      worksheet['!cols'] = [
        { wch: 15 }, // Código COMP
        { wch: 50 }, // Nomenclatura
        { wch: 10 }, // ND
        { wch: 10 }, // SI
        ...ANOS.map(() => ({ wch: 10 })),
        { wch: 15 }, // Média Simples
        { wch: 15 }, // Média Ponderada
        { wch: 15 }, // Média Mensal
      ]

      xlsx.writeFile(workbook, `Historico_Fornecimento_Master_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err: any) {
      setError(`Erro ao exportar: ${err.message}`)
    }
    setExporting(false)
  }

  const debouncedSearch = useDebounce(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getFornecimentosPaginado(debouncedSearch, page, PER_PAGE)
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
      {/* Controles */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="input pl-9"
            placeholder="Buscar componente ou nomenclatura..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary !py-2 !px-3" onClick={load} disabled={loading || exporting} title="Recarregar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          className="btn-primary !py-2 !px-3 flex items-center gap-2 text-xs font-semibold"
          onClick={handleExportXlsx}
          disabled={loading || exporting}
        >
          <FileSpreadsheet size={14} className={exporting ? 'animate-pulse' : ''} />
          <span>{exporting ? 'Gerando Relatório...' : 'Baixar Relatório (XLSX)'}</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-surface-400 ml-auto">
          <History size={14} />
          <span>{loading ? '...' : `${total.toLocaleString('pt-BR')} MASTER`}</span>
          <span className="text-surface-400">|</span>
          <span className="font-semibold text-primary-300">CAVEX • últimos 5 anos</span>
        </div>
      </div>

      {error && <ErrorCard message={error} onRetry={load} />}

      {/* Tabela */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-800/60">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                Componente MASTER
              </th>
              {ANOS.map(a => (
                <th key={a} className="px-3 py-3 text-right text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 whitespace-nowrap">
                  {a}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 whitespace-nowrap">M.Simples</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 whitespace-nowrap">M.Ponderada</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 whitespace-nowrap">Méd/Mês</th>
              <th className="px-3 py-3 border-b border-surface-600/60 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={ANOS.length + 5} className="py-16">
                  <LoadingSpinner text="Buscando histórico de consumo..." />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={ANOS.length + 5} className="py-16 text-center text-surface-400 text-sm">
                  Nenhum resultado{search ? ` para "${search}"` : ''}.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <MasterConsumoLine
                  key={row.cdComp}
                  row={row}
                  expanded={expanded.has(row.cdComp)}
                  onToggle={() => toggle(row.cdComp)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between text-xs text-surface-400">
          <span>
            Página {page + 1} de {totalPages} — {total.toLocaleString('pt-BR')} MASTER no total
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !py-1.5 !px-3"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Ant.
            </button>
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
        Pesos: ano mais antigo = 1 → mais recente = 5. Média mensal = ponderada ÷ 12.
        Clique em uma linha para ver os fornecimentos individuais da família.
      </p>
    </div>
  )
}
