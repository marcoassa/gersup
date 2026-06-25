import { useState, useCallback, useEffect } from 'react'
import { Search, RefreshCw, ChevronDown, ChevronUp, Package, Box, Filter, Pencil, Check, X, History, EyeOff, Eye } from 'lucide-react'
import {
  getProdutosPaginado,
  getMasterByCdComp,
  getEquivalentesByMaster,
  getFornecimentosByFamilia,
  updateFamiliaCM,
} from '@/lib/api'
import { useModificadoresStore } from '@/hooks/useModificadoresStore'
import type { Produto, Fornecimento } from '@/types'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import { formatDate, getSiTitulo, cn } from '@/lib/utils'

const PER_PAGE = 40

function useDebounce<T>(value: T, delay = 400): T {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return d
}

// ─── Linha Expandida ──────────────────────────────────────────────────────────

function ProdutoExpanded({ produto }: { produto: Produto }) {
  const [loading, setLoading] = useState(true)
  const [master, setMaster] = useState<Produto | null>(null)
  const [equivalentes, setEquivalentes] = useState<Produto[]>([])
  const [fornecimentos, setFornecimentos] = useState<Fornecimento[]>([])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      setLoading(true)
      
      const cdCompMaster = produto.pos_familia === 'MASTER' ? produto.cd_comp : (produto.cd_comp_master || produto.cd_comp)

      // Fetch Master se o produto atual for Equivalente
      let pMaster: Produto | null = produto.pos_familia === 'MASTER' ? produto : null
      if (!pMaster && cdCompMaster) {
        const res = await getMasterByCdComp(cdCompMaster)
        if (res.data) pMaster = res.data
      }

      // Fetch Equivalentes
      const resEq = await getEquivalentesByMaster(cdCompMaster)
      
      // Fetch Fornecimentos
      const resForn = await getFornecimentosByFamilia(cdCompMaster)

      if (isMounted) {
        setMaster(pMaster)
        setEquivalentes(resEq.data ?? [])
        setFornecimentos(resForn.data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { isMounted = false }
  }, [produto])

  if (loading) {
    return <div className="p-4"><LoadingSpinner text="Carregando detalhes da família..." /></div>
  }

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-surface-800/40">
      {/* Coluna Esquerda: Família */}
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
            Produto MASTER da Família
          </p>
          {master ? (
            <div className="card p-3 bg-surface-700/30 border-primary-500/20">
              <div className="flex gap-2">
                <Box size={16} className="text-primary-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs text-primary-300">{master.cd_comp}</p>
                  <p className="text-sm text-surface-50">{master.nomenclatura}</p>
                  <p className="text-xs text-surface-400 mt-1">
                    CM: <span className="font-mono text-surface-200">{master.cm || '—'}</span> • PN: {master.pn || '—'}
                  </p>
                  {master.si && (
                    <p className="text-[10px] text-surface-400 mt-0.5">
                      ND {master.nd} / SI {master.si} - {getSiTitulo(master.si)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-surface-300">MASTER não encontrado.</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
            Produtos Equivalentes ({equivalentes.length})
          </p>
          {equivalentes.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {equivalentes.map(eq => (
                <div key={eq.cd_comp} className={`p-3 rounded border border-surface-600/40 ${eq.cd_comp === produto.cd_comp ? 'bg-surface-600/30 ring-1 ring-surface-500' : 'bg-surface-800'}`}>
                  <p className="font-mono text-xs text-surface-300">{eq.cd_comp}</p>
                  <p className="text-xs text-surface-100">{eq.nomenclatura}</p>
                  <p className="text-[10px] text-surface-400 mt-1">PN: {eq.pn || '—'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-surface-300">Nenhum equivalente cadastrado para esta família.</p>
          )}
        </div>
      </div>

      {/* Coluna Direita: Fornecimentos */}
      <div>
        <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
          Histórico de Fornecimento da Família ({fornecimentos.length})
        </p>
        <div className="card p-0 bg-surface-800/80">
          {fornecimentos.length > 0 ? (
            <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs text-left">
                <thead className="sticky top-0 bg-surface-700/80 backdrop-blur-md text-surface-400">
                  <tr>
                    <th className="py-2 px-3 font-medium">Data</th>
                    <th className="py-2 px-3 font-medium">Item Fornecido</th>
                    <th className="py-2 px-3 font-medium text-right">Qtd</th>
                    <th className="py-2 px-3 font-medium">Solicitante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-700/40">
                  {fornecimentos.map(f => (
                    <tr key={f.id} className="hover:bg-surface-700/30">
                      <td className="py-2 px-3 text-surface-300 whitespace-nowrap">
                        {f.data ? formatDate(f.data) : f.ano}
                      </td>
                      <td className="py-2 px-3 font-mono text-[10px] text-surface-400">
                        {f.cd_comp}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-surface-100">
                        {Number(f.quantidade).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-3 text-surface-400 truncate max-w-[120px]">
                        {f.solicitante || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-surface-300 text-xs">
              <History size={24} className="mx-auto mb-2 opacity-50" />
              Nenhum fornecimento registrado para esta família no CAVEX.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Linha da Tabela ──────────────────────────────────────────────────────────

function ProdutoLine({ row, expanded, onToggle, onCmUpdate, onIgnorar, ignorado }: {
  row: Produto
  expanded: boolean
  onToggle: () => void
  onCmUpdate: (masterCd: string, cm: string) => Promise<void>
  onIgnorar: (cdComp: string, nomenclatura: string) => Promise<void>
  ignorado: boolean
}) {
  const isMaster = row.pos_familia === 'MASTER'
  const [isEditingCm, setIsEditingCm] = useState(false)
  const [cmValue, setCmValue] = useState(row.cm || '')
  const [savingCm, setSavingCm] = useState(false)

  const handleSaveCm = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setSavingCm(true)
    const masterCd = isMaster ? row.cd_comp : (row.cd_comp_master || row.cd_comp)
    await onCmUpdate(masterCd, cmValue)
    setSavingCm(false)
    setIsEditingCm(false)
  }

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors border-b border-surface-700/40 ${expanded ? 'bg-primary-900/10' : 'hover:bg-surface-700/30'}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 w-8">
          <div className="flex items-center justify-center">
            {isMaster ? (
              <span title="MASTER"><Box size={14} className="text-primary-400" /></span>
            ) : (
              <span title="EQUIVALENTE"><Package size={14} className="text-surface-300" /></span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="font-mono text-xs text-primary-300">{row.cd_comp}</p>
          <p className="text-[10px] text-surface-300 mt-0.5">Família: <span className="font-mono text-surface-400">{row.cd_comp_master || row.cd_comp}</span></p>
        </td>
        <td className="px-4 py-3">
          <p className="text-xs text-surface-100 line-clamp-2 max-w-md">{row.nomenclatura}</p>
          {row.si && <p className="text-[10px] text-surface-400 mt-0.5 truncate max-w-md">SI {row.si} - {getSiTitulo(row.si)}</p>}
        </td>
        <td className="px-4 py-3" onClick={e => isEditingCm && e.stopPropagation()}>
          {isEditingCm ? (
            <div className="flex items-center gap-1">
              <input 
                className="input !py-1 !px-2 text-xs w-24" 
                value={cmValue} 
                onChange={e => setCmValue(e.target.value)} 
                autoFocus
                disabled={savingCm}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCm(e); if (e.key === 'Escape') setIsEditingCm(false) }}
              />
              <button onClick={handleSaveCm} disabled={savingCm} className="text-emerald-400 hover:text-emerald-300"><Check size={14}/></button>
              <button onClick={(e) => { e.stopPropagation(); setIsEditingCm(false) }} disabled={savingCm} className="text-surface-400 hover:text-surface-300"><X size={14}/></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group min-h-[24px]">
              <span className="text-xs text-surface-100 font-mono">
                {row.cm ? row.cm : <span className="text-surface-400 italic text-[10px]">Adicionar CM</span>}
              </span>
              <button 
                onClick={(e) => { e.stopPropagation(); setCmValue(row.cm || ''); setIsEditingCm(true) }} 
                className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-primary-400 transition-opacity"
                title="Editar CM da família"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          <p className="text-xs text-surface-300 truncate max-w-[120px]">{row.pn || '—'}</p>
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isMaster ? 'bg-primary-900/40 text-primary-300 border border-primary-700/30' : 'bg-surface-700 text-surface-300 border border-surface-600'}`}>
            {isMaster ? 'MASTER' : 'EQUIV'}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {expanded
            ? <ChevronUp size={14} className="inline text-surface-400" />
            : <ChevronDown size={14} className="inline text-surface-400" />
          }
        </td>
        {/* Botão rápido Ignorar — apenas para MASTER */}
        {isMaster && (
          <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onIgnorar(row.cd_comp, row.nomenclatura)}
              title={ignorado ? 'Restaurar item (remover ignorar)' : 'Ignorar item de todas as análises'}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                ignorado
                  ? 'text-emerald-400 hover:bg-emerald-900/20 bg-emerald-950/30 border border-emerald-800/40'
                  : 'text-surface-400 hover:text-red-400 hover:bg-red-900/20'
              )}
            >
              {ignorado ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </td>
        )}
        {!isMaster && <td className="px-3 py-3" />}
      </tr>
      {expanded && (
        <tr className="border-b border-surface-700/40">
          <td colSpan={7} className="p-0">
            <ProdutoExpanded produto={row} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function Produtos() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Store de modificadores para o botão rápido de ignorar
  const { modificadoresMap, fetched: modFetched, fetchModificadores, toggleIgnorar } = useModificadoresStore()
  useEffect(() => { if (!modFetched) fetchModificadores() }, [modFetched, fetchModificadores])

  // Filtros
  const [somenteMaster, setSomenteMaster] = useState(false)
  const [fornecimentoRelevante, setFornecimentoRelevante] = useState(false)

  const debouncedSearch = useDebounce(search)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getProdutosPaginado(
      debouncedSearch,
      somenteMaster,
      fornecimentoRelevante,
      page,
      PER_PAGE
    )
    if (res.error) {
      setError(res.error)
    } else {
      setRows(res.rows)
      setTotal(res.total)
    }
    setLoading(false)
  }, [debouncedSearch, somenteMaster, fornecimentoRelevante, page])

  useEffect(() => {
    setPage(0)
    setExpanded(new Set())
  }, [debouncedSearch, somenteMaster, fornecimentoRelevante])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleCmUpdate = async (masterCd: string, cm: string) => {
    await updateFamiliaCM(masterCd, cm)
    setRows(prev => prev.map(r => {
      const rMaster = r.pos_familia === 'MASTER' ? r.cd_comp : (r.cd_comp_master || r.cd_comp)
      if (rMaster === masterCd) return { ...r, cm }
      return r
    }))
  }

  const handleIgnorar = useCallback(async (cdComp: string, nomenclatura: string) => {
    await toggleIgnorar(cdComp, nomenclatura)
  }, [toggleIgnorar])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-surface-800 p-4 rounded-xl border border-surface-700/40">
        <div className="relative flex-1 w-full min-w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Buscar por código, nomenclatura, CM ou Part Number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-surface-200 cursor-pointer hover:text-surface-50 transition-colors">
            <input
              type="checkbox"
              className="rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500/30 focus:ring-offset-0 w-4 h-4"
              checked={somenteMaster}
              onChange={e => setSomenteMaster(e.target.checked)}
            />
            Somente MASTER
          </label>
          
          <label className="flex items-center gap-2 text-xs text-surface-200 cursor-pointer hover:text-surface-50 transition-colors" title="Histórico de fornecimento em pelo menos 3 dos últimos 5 anos">
            <input
              type="checkbox"
              className="rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500/30 focus:ring-offset-0 w-4 h-4"
              checked={fornecimentoRelevante}
              onChange={e => setFornecimentoRelevante(e.target.checked)}
            />
            <span className="flex items-center gap-1.5">
              <Filter size={12} className={fornecimentoRelevante ? 'text-primary-400' : 'text-surface-300'} />
              Fornecimento Relevante
            </span>
          </label>

          <button className="btn-secondary !py-2 !px-3" onClick={load} disabled={loading} title="Atualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-surface-400 px-1">
        <span>{loading ? '...' : `${total.toLocaleString('pt-BR')} itens encontrados`}</span>
      </div>

      {error && <ErrorCard message={error} onRetry={load} />}

      {/* Tabela */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface-800/60">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 w-8" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                Código
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                Nomenclatura
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                CM
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                Part Number (PN)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60">
                Status
              </th>
              <th className="px-3 py-3 border-b border-surface-600/60 w-8" title="Ignorar"><EyeOff size={12} className="inline text-surface-500" /></th>
              <th className="px-3 py-3 border-b border-surface-600/60 w-8" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-16">
                  <LoadingSpinner text="Buscando produtos..." />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-surface-400 text-sm">
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <ProdutoLine
                  key={row.cd_comp}
                  row={row}
                  expanded={expanded.has(row.cd_comp)}
                  onToggle={() => toggle(row.cd_comp)}
                  onCmUpdate={handleCmUpdate}
                  onIgnorar={handleIgnorar}
                  ignorado={modificadoresMap.get(row.cd_comp)?.ignorar === true}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {total > PER_PAGE && (
        <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-surface-400 gap-4">
          <span>
            Página {page + 1} de {totalPages} — Mostrando {rows.length} de {total.toLocaleString('pt-BR')} itens
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !py-1.5 !px-3"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Ant.
            </button>
            <div className="hidden sm:flex gap-1">
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
            </div>
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
    </div>
  )
}
