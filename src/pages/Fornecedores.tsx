import { useState, useMemo, useEffect } from 'react'
import {
  Building2, Search, AlertTriangle, CheckCircle2, ShieldAlert,
  RotateCcw, Edit3, X, Check
} from 'lucide-react'
import { getFornecedoresConsolidados, atualizarImpedimentoFornecedor } from '@/lib/api'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import { cn } from '@/lib/utils'
import type { FornecedorConsolidado } from '@/types'

const MOTIVOS_SUGERIDOS = [
  'Empresa impedida de licitar ou contratar com a Administração',
  'Sancionada no SICAF / CADIN',
  'Inadimplência ou rescisão contratual prévia',
  'Descumprimento grave de prazo de entrega',
  'Irregularidade fiscal ou trabalhista impeditiva',
  'Problemas de qualidade / desconformidade reiterada de produto',
]

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState<FornecedorConsolidado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVOS' | 'IMPEDIDOS'>('TODOS')

  // Modal de Impedimento / Edição
  const [modalOpen, setModalOpen] = useState(false)
  const [fornecedorEditando, setFornecedorEditando] = useState<FornecedorConsolidado | null>(null)
  const [motivoInput, setMotivoInput] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const carregarDados = async () => {
    setLoading(true)
    setError(null)
    const res = await getFornecedoresConsolidados()
    if (res.error) {
      setError(res.error)
    } else {
      setFornecedores(res.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    carregarDados()

    const handleStorageChange = () => {
      carregarDados()
    }
    window.addEventListener('gersup_fornecedores_impedidos_change', handleStorageChange)
    return () => {
      window.removeEventListener('gersup_fornecedores_impedidos_change', handleStorageChange)
    }
  }, [])

  // Limpa feedback após 4 segundos
  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [feedbackMsg])

  // Contadores
  const stats = useMemo(() => {
    const total = fornecedores.length
    const impedidos = fornecedores.filter(f => f.impedido_empenho).length
    const ativos = total - impedidos
    return { total, impedidos, ativos }
  }, [fornecedores])

  // Lista filtrada
  const fornecedoresFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    return fornecedores.filter(f => {
      if (filtroStatus === 'ATIVOS' && f.impedido_empenho) return false
      if (filtroStatus === 'IMPEDIDOS' && !f.impedido_empenho) return false

      if (!termo) return true

      const cnpjClean = f.clean_cnpj.toLowerCase()
      const cnpjFormat = f.cnpj.toLowerCase()
      const razao = f.razao_social.toLowerCase()
      const fantasia = (f.nome_fantasia || '').toLowerCase()
      const motivo = (f.motivo_impedimento || '').toLowerCase()
      const temPregao = f.pregoes.some(p => p.toLowerCase().includes(termo))

      return (
        cnpjClean.includes(termo) ||
        cnpjFormat.includes(termo) ||
        razao.includes(termo) ||
        fantasia.includes(termo) ||
        motivo.includes(termo) ||
        temPregao
      )
    })
  }, [fornecedores, busca, filtroStatus])

  const abrirModalImpedimento = (f: FornecedorConsolidado) => {
    setFornecedorEditando(f)
    setMotivoInput(f.motivo_impedimento || '')
    setModalOpen(true)
  }

  const fecharModal = () => {
    setModalOpen(false)
    setFornecedorEditando(null)
    setMotivoInput('')
  }

  const salvarImpedimento = async () => {
    if (!fornecedorEditando) return
    const motivoFinal = motivoInput.trim()
    if (!motivoFinal) {
      setFeedbackMsg({ tipo: 'erro', texto: 'Informe o motivo do impedimento.' })
      return
    }

    setSalvando(true)
    const res = await atualizarImpedimentoFornecedor(
      fornecedorEditando.cnpj,
      true,
      motivoFinal,
      fornecedorEditando.razao_social
    )

    setSalvando(false)
    if (res.error) {
      setFeedbackMsg({ tipo: 'erro', texto: res.error })
    } else {
      setFeedbackMsg({
        tipo: 'sucesso',
        texto: `Fornecedor "${fornecedorEditando.razao_social}" marcado como IMPEDIDO de empenho.`,
      })
      fecharModal()
      carregarDados()
    }
  }

  const reabilitarFornecedor = async (f: FornecedorConsolidado) => {
    if (!window.confirm(`Deseja reabilitar o fornecedor "${f.razao_social}" para empenho?`)) {
      return
    }

    setSalvando(true)
    const res = await atualizarImpedimentoFornecedor(f.cnpj, false, null, f.razao_social)
    setSalvando(false)

    if (res.error) {
      setFeedbackMsg({ tipo: 'erro', texto: res.error })
    } else {
      setFeedbackMsg({
        tipo: 'sucesso',
        texto: `Fornecedor "${f.razao_social}" reabilitado com sucesso. Itens liberados para empenho.`,
      })
      carregarDados()
    }
  }

  if (loading && fornecedores.length === 0) return <LoadingSpinner />
  if (error) return <ErrorCard message={error} onRetry={carregarDados} />

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-surface-700/60 border border-surface-600/40 text-primary-400">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Gestão de Fornecedores</h1>
              <p className="text-xs text-surface-400">
                Controle cadastral e restrições/impedimentos de empenho para aquisições públicas
              </p>
            </div>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="flex items-center gap-2">
          <div className="bg-surface-800/80 border border-surface-700 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-xs text-surface-400">Total:</span>
            <span className="text-sm font-bold text-white">{stats.total}</span>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-800/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-xs text-emerald-400">Ativos:</span>
            <span className="text-sm font-bold text-emerald-300">{stats.ativos}</span>
          </div>
          <div className="bg-amber-950/30 border border-amber-800/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-xs text-amber-400">Impedidos:</span>
            <span className="text-sm font-bold text-amber-300">{stats.impedidos}</span>
          </div>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={cn(
            'p-3 rounded-lg text-xs font-semibold flex items-center justify-between transition-all duration-200 shadow-md',
            feedbackMsg.tipo === 'sucesso'
              ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-600'
              : 'bg-red-900/90 text-red-200 border border-red-600'
          )}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.tipo === 'sucesso' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{feedbackMsg.texto}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-surface-800/60 border border-surface-700/60 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por Razão Social, CNPJ ou Pregão..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-surface-900/80 border border-surface-600/60 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500/60 focus:ring-1 focus:ring-primary-500/30 transition-colors"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Abas / Filtro de Status */}
        <div className="flex items-center gap-1.5 bg-surface-900/60 p-1 rounded-lg border border-surface-700/50">
          <button
            onClick={() => setFiltroStatus('TODOS')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              filtroStatus === 'TODOS'
                ? 'bg-surface-700 text-white shadow-sm'
                : 'text-surface-400 hover:text-surface-200'
            )}
          >
            Todos ({stats.total})
          </button>
          <button
            onClick={() => setFiltroStatus('ATIVOS')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              filtroStatus === 'ATIVOS'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40 shadow-sm'
                : 'text-surface-400 hover:text-surface-200'
            )}
          >
            Ativos ({stats.ativos})
          </button>
          <button
            onClick={() => setFiltroStatus('IMPEDIDOS')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              filtroStatus === 'IMPEDIDOS'
                ? 'bg-amber-950/60 text-amber-300 border border-amber-700/40 shadow-sm'
                : 'text-surface-400 hover:text-surface-200'
            )}
          >
            Impedidos ({stats.impedidos})
          </button>
        </div>
      </div>

      {/* Tabela de Fornecedores */}
      <div className="bg-surface-800/40 border border-surface-700/60 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-800/80 border-b border-surface-700/60 text-surface-400 uppercase tracking-wider font-semibold text-[11px]">
                <th className="px-4 py-3">Fornecedor / Razão Social</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3 text-center">Status de Empenho</th>
                <th className="px-4 py-3">Pregões Vinculados</th>
                <th className="px-4 py-3 text-right">Itens</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700/40">
              {fornecedoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-surface-400">
                    Nenhum fornecedor encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                fornecedoresFiltrados.map(f => {
                  return (
                    <tr
                      key={f.clean_cnpj}
                      className={cn(
                        'hover:bg-surface-700/30 transition-colors',
                        f.impedido_empenho && 'bg-amber-950/10'
                      )}
                    >
                      {/* Fornecedor */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="font-semibold text-surface-100 leading-snug">
                          {f.razao_social}
                        </div>
                        {f.nome_fantasia && (
                          <div className="text-[11px] text-surface-400 italic">
                            {f.nome_fantasia}
                          </div>
                        )}
                      </td>

                      {/* CNPJ */}
                      <td className="px-4 py-3.5 font-mono text-surface-300">
                        {f.cnpj}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        {f.impedido_empenho ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/50">
                              <AlertTriangle size={12} className="text-amber-400" />
                              Impedido
                            </span>
                            {f.motivo_impedimento && (
                              <span
                                className="text-[11px] text-amber-300/80 max-w-xs truncate cursor-help"
                                title={f.motivo_impedimento}
                              >
                                {f.motivo_impedimento}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-700/40">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            Ativo
                          </span>
                        )}
                      </td>

                      {/* Pregões */}
                      <td className="px-4 py-3.5">
                        {f.pregoes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {f.pregoes.map(pNum => (
                              <span
                                key={pNum}
                                className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-700/60 border border-surface-600/50 text-[10px] text-surface-300 font-mono"
                              >
                                {pNum}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-surface-500">—</span>
                        )}
                      </td>

                      {/* Itens */}
                      <td className="px-4 py-3.5 text-right font-bold text-surface-200 font-mono">
                        {f.total_itens > 0 ? f.total_itens : '—'}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {f.impedido_empenho ? (
                            <>
                              <button
                                onClick={() => reabilitarFornecedor(f)}
                                title="Reabilitar fornecedor para receber empenhos"
                                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/40 transition-colors inline-flex items-center gap-1"
                              >
                                <RotateCcw size={12} />
                                <span>Reabilitar</span>
                              </button>
                              <button
                                onClick={() => abrirModalImpedimento(f)}
                                title="Editar motivo do impedimento"
                                className="p-1 rounded-lg text-surface-400 hover:text-amber-300 hover:bg-surface-700/60 transition-colors"
                              >
                                <Edit3 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => abrirModalImpedimento(f)}
                              title="Impedir fornecedor de receber novos empenhos"
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-600/40 transition-colors inline-flex items-center gap-1"
                            >
                              <ShieldAlert size={12} className="text-amber-400" />
                              <span>Impedir Empenho</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Impedimento */}
      {modalOpen && fornecedorEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-surface-700">
              <div className="flex items-center gap-2 text-amber-400">
                <ShieldAlert size={20} />
                <h3 className="text-base font-bold text-white">
                  {fornecedorEditando.impedido_empenho ? 'Editar Impedimento' : 'Impedir Fornecedor de Empenho'}
                </h3>
              </div>
              <button onClick={fecharModal} className="text-surface-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Identificação do Fornecedor */}
            <div className="bg-surface-900/80 p-3 rounded-lg border border-surface-700/60 space-y-1">
              <div className="text-xs text-surface-400">Fornecedor Selecionado:</div>
              <div className="text-sm font-semibold text-white">{fornecedorEditando.razao_social}</div>
              <div className="text-xs font-mono text-surface-400">CNPJ: {fornecedorEditando.cnpj}</div>
              {fornecedorEditando.pregoes.length > 0 && (
                <div className="text-[11px] text-surface-400 pt-1">
                  Pregões vinculados: <span className="text-surface-300 font-mono">{fornecedorEditando.pregoes.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Sugestões Rápidas */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-300">
                Sugestões rápidas de motivos:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_SUGERIDOS.map((motivo, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMotivoInput(motivo)}
                    className="text-[11px] px-2 py-1 rounded bg-surface-700/60 hover:bg-surface-700 text-surface-300 hover:text-white border border-surface-600/50 transition-colors text-left"
                  >
                    + {motivo}
                  </button>
                ))}
              </div>
            </div>

            {/* Campo Motivo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-200">
                Motivo / Justificativa do Impedimento: <span className="text-red-400">*</span>
              </label>
              <textarea
                value={motivoInput}
                onChange={e => setMotivoInput(e.target.value)}
                placeholder="Ex: Empresa sancionada no SICAF ou impedida de licitar com a Administração Pública..."
                rows={3}
                className="w-full p-2.5 text-xs bg-surface-900/90 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-colors resize-none"
              />
              <p className="text-[11px] text-surface-400">
                Ao salvar, todos os itens associados a este fornecedor serão marcados como 
                <span className="text-amber-400 font-semibold"> "Impedido" (em amarelo)</span> na tela de Compras e bloqueados para novo empenho.
              </p>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-surface-700">
              <button
                type="button"
                onClick={fecharModal}
                disabled={salvando}
                className="px-4 py-2 text-xs font-medium rounded-lg text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarImpedimento}
                disabled={salvando || !motivoInput.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 shadow-md shadow-amber-900/30"
              >
                <ShieldAlert size={14} />
                <span>{salvando ? 'Salvando...' : 'Confirmar Impedimento'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
