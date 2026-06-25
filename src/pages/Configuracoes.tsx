import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Search, Save, Trash2, Plus, Sparkles,
  CheckCircle, AlertCircle, X, Pencil, EyeOff, Eye
} from 'lucide-react'
import { useModificadoresStore } from '@/hooks/useModificadoresStore'
import { getMasters } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Produto, ModificadorPlanejamento } from '@/types'
import { formatCurrency, cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/States'

// ─── Busca de MASTER com debounce ─────────────────────────────────────────────
function useDebouncedSearch(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─── Badge de campo corrigido ──────────────────────────────────────────────────
const CAMPO_LABEL: Record<string, string> = {
  nomenclatura_override: 'Descrição',
  media_anual_override: 'Média Anual',
  preco_unitario_override: 'Preço Unit.',
  estoque_override: 'Estoque',
}

function CamposBadges({ mod }: { mod: ModificadorPlanejamento }) {
  const campos = (Object.keys(CAMPO_LABEL) as Array<keyof typeof CAMPO_LABEL>)
    .filter(k => mod[k as keyof ModificadorPlanejamento] != null)
  return (
    <div className="flex flex-wrap gap-1">
      {campos.map(k => (
        <span key={k} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-900/50 text-amber-300 border border-amber-700/40">
          <Sparkles size={8} />
          {CAMPO_LABEL[k]}
        </span>
      ))}
    </div>
  )
}

// ─── Formulário de Modificador ─────────────────────────────────────────────────
interface FormState {
  ignorar: boolean
  nomenclatura_override: string
  media_anual_override: string
  preco_unitario_override: string
  estoque_override: string
  observacao: string
}

const FORM_VAZIO: FormState = {
  ignorar: false,
  nomenclatura_override: '',
  media_anual_override: '',
  preco_unitario_override: '',
  estoque_override: '',
  observacao: '',
}

export default function Configuracoes() {
  const { lista, loading: storeLoading, fetched, fetchModificadores, upsert, remove } =
    useModificadoresStore()

  // Mapa cd_comp_master → nomenclatura original do banco
  const [nomenclaturasOriginais, setNomenclaturasOriginais] = useState<Record<string, string>>({})

  // Garante que o store está carregado
  useEffect(() => {
    if (!fetched) fetchModificadores()
  }, [fetched, fetchModificadores])

  // Busca nomenclaturas originais em lote sempre que a lista mudar
  useEffect(() => {
    if (lista.length === 0) return
    const cdComps = lista.map(m => m.cd_comp_master)
    supabase
      .from('produtos')
      .select('cd_comp, nomenclatura')
      .in('cd_comp', cdComps)
      .eq('pos_familia', 'MASTER')
      .then(({ data }) => {
        if (!data) return
        const mapa: Record<string, string> = {}
        for (const p of data) mapa[p.cd_comp] = p.nomenclatura
        setNomenclaturasOriginais(mapa)
      })
  }, [lista])

  // ── Estado do formulário ──
  const [searchMaster, setSearchMaster] = useState('')
  const [masterSelecionado, setMasterSelecionado] = useState<Produto | null>(null)
  const [sugestoes, setSugestoes] = useState<Produto[]>([])
  const [buscandoMaster, setBuscandoMaster] = useState(false)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendoKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  const debouncedSearch = useDebouncedSearch(searchMaster)

  // ── Autocomplete de MASTERs ──
  useEffect(() => {
    if (debouncedSearch.length < 2) { setSugestoes([]); return }
    setBuscandoMaster(true)
    getMasters().then(res => {
      const q = debouncedSearch.toLowerCase()
      const filtrados = (res.data ?? []).filter(p =>
        p.cd_comp.toLowerCase().includes(q) ||
        p.nomenclatura.toLowerCase().includes(q) ||
        (p.pn ?? '').toLowerCase().includes(q)
      ).slice(0, 10)
      setSugestoes(filtrados)
      setBuscandoMaster(false)
    })
  }, [debouncedSearch])

  const selecionarMaster = useCallback((produto: Produto) => {
    setMasterSelecionado(produto)
    setSearchMaster(`${produto.cd_comp} — ${produto.nomenclatura}`)
    setMostrarSugestoes(false)
    // Pré-preenche com override existente se houver
    const modExistente = lista.find(m => m.cd_comp_master === produto.cd_comp)
    if (modExistente) {
      setForm({
        ignorar: modExistente.ignorar === true,
        nomenclatura_override: modExistente.nomenclatura_override ?? '',
        media_anual_override: modExistente.media_anual_override?.toString() ?? '',
        preco_unitario_override: modExistente.preco_unitario_override?.toString() ?? '',
        estoque_override: modExistente.estoque_override?.toString() ?? '',
        observacao: modExistente.observacao ?? '',
      })
    } else {
      setForm(FORM_VAZIO)
    }
  }, [lista])

  const limparSelecao = () => {
    setMasterSelecionado(null)
    setSearchMaster('')
    setForm(FORM_VAZIO)
    setSugestoes([])
    setFeedback(null)
  }

  const mostrarFeedback = (tipo: 'ok' | 'erro', msg: string) => {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleSalvar = async () => {
    if (!masterSelecionado) return
    if (!form.observacao.trim()) {
      mostrarFeedback('erro', 'Informe o motivo da correção antes de salvar.')
      return
    }
    // Quando ignorar=true, não exige outros campos. Caso contrário, pelo menos um deve estar preenchido.
    if (!form.ignorar) {
      const algumCampo = form.nomenclatura_override.trim() ||
        form.media_anual_override.trim() ||
        form.preco_unitario_override.trim() ||
        form.estoque_override.trim()
      if (!algumCampo) {
        mostrarFeedback('erro', 'Preencha pelo menos um campo de correção ou ative "Ignorar Item".')
        return
      }
    }

    setSalvando(true)
    const err = await upsert({
      cd_comp_master: masterSelecionado.cd_comp,
      ignorar: form.ignorar,
      nomenclatura_override: form.ignorar ? null : (form.nomenclatura_override.trim() || null),
      media_anual_override: form.ignorar ? null : (form.media_anual_override ? Number(form.media_anual_override) : null),
      preco_unitario_override: form.ignorar ? null : (form.preco_unitario_override ? Number(form.preco_unitario_override) : null),
      estoque_override: form.ignorar ? null : (form.estoque_override ? Number(form.estoque_override) : null),
      observacao: form.observacao.trim(),
      criado_por: 'GERSUP',
    })
    setSalvando(false)
    if (err) {
      mostrarFeedback('erro', `Erro ao salvar: ${err}`)
    } else {
      mostrarFeedback('ok', form.ignorar ? 'Item marcado como ignorado. Removido de todas as análises.' : 'Modificador salvo com sucesso!')
    }
  }

  const handleRemover = async (cdComp: string) => {
    setRemovendoKey(cdComp)
    const err = await remove(cdComp)
    setRemovendoKey(null)
    if (err) {
      mostrarFeedback('erro', `Erro ao remover: ${err}`)
    } else {
      mostrarFeedback('ok', 'Modificador removido. Dados originais restaurados.')
      if (masterSelecionado?.cd_comp === cdComp) limparSelecao()
    }
  }

  const editarModificador = (mod: ModificadorPlanejamento) => {
    const nomDisplay = mod.nomenclatura_override ?? mod.cd_comp_master
    const fakeProduto = {
      cd_comp: mod.cd_comp_master,
      nomenclatura: nomDisplay,
      pos_familia: 'MASTER',
    } as Produto
    setMasterSelecionado(fakeProduto)
    setSearchMaster(`${mod.cd_comp_master} — ${nomDisplay}`)
    setForm({
      ignorar: mod.ignorar === true,
      nomenclatura_override: mod.nomenclatura_override ?? '',
      media_anual_override: mod.media_anual_override?.toString() ?? '',
      preco_unitario_override: mod.preco_unitario_override?.toString() ?? '',
      estoque_override: mod.estoque_override?.toString() ?? '',
      observacao: mod.observacao ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-surface-700/60">
        <div className="p-2 rounded-xl bg-amber-900/30 border border-amber-700/30">
          <Settings className="text-amber-400" size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-surface-50">Configurações — Modificadores de Dados</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            Corrija dados de planejamento sem alterar os registros importados. As correções propagam para todas as telas.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 rounded-lg border border-amber-700/30">
          <Sparkles size={12} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-300">{lista.length} correção(ões) ativa(s)</span>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all',
          feedback.tipo === 'ok'
            ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
            : 'bg-red-900/30 border-red-700/40 text-red-300'
        )}>
          {feedback.tipo === 'ok'
            ? <CheckCircle size={16} className="shrink-0" />
            : <AlertCircle size={16} className="shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* ── SEÇÃO A: Formulário ── */}
      <div className="card p-0 overflow-hidden border-surface-700/60">
        <div className="px-5 py-4 bg-surface-800/60 border-b border-surface-700/50 flex items-center gap-2">
          <Plus size={14} className="text-primary-400" />
          <span className="text-sm font-bold text-surface-50">
            {masterSelecionado ? 'Editar Modificador' : 'Novo Modificador'}
          </span>
          {masterSelecionado && (
            <button onClick={limparSelecao} className="ml-auto text-surface-400 hover:text-surface-200 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Busca de MASTER */}
          <div>
            <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">
              Selecionar Item MASTER
            </label>
            <div className="relative">
              <div className="flex items-center gap-3 bg-surface-800 px-4 py-3 rounded-xl border border-surface-700/60 focus-within:border-primary-500/60 transition-colors">
                <Search size={14} className="text-surface-400 shrink-0" />
                <input
                  className="flex-1 bg-transparent border-0 outline-none text-sm text-surface-100 placeholder:text-surface-400"
                  placeholder="Buscar por código MASTER, nomenclatura ou Part Number..."
                  value={searchMaster}
                  onChange={e => { setSearchMaster(e.target.value); setMostrarSugestoes(true); setMasterSelecionado(null) }}
                  onFocus={() => setMostrarSugestoes(true)}
                />
                {buscandoMaster && <div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin shrink-0" />}
                {masterSelecionado && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
              </div>

              {/* Dropdown de sugestões */}
              {mostrarSugestoes && sugestoes.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface-800 border border-surface-600/60 rounded-xl shadow-2xl overflow-hidden">
                  {sugestoes.map(p => (
                    <button
                      key={p.cd_comp}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-700/60 transition-colors text-left border-b border-surface-700/30 last:border-0"
                      onClick={() => selecionarMaster(p)}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-bold text-primary-300">{p.cd_comp}</p>
                        <p className="text-xs text-surface-100 truncate">{p.nomenclatura}</p>
                        {p.si && <p className="text-[10px] text-surface-400 mt-0.5">SI {p.si} • PN: {p.pn ?? '—'}</p>}
                      </div>
                      {lista.find(m => m.cd_comp_master === p.cd_comp) && (
                        <span className="shrink-0 ml-auto mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-900/50 text-amber-400 border border-amber-700/30">
                          <Sparkles size={7} /> JÁ CORRIGIDO
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Toggle: Ignorar Item */}
          <div className={cn(
            'flex items-center gap-4 p-4 rounded-xl border transition-all',
            form.ignorar
              ? 'bg-red-950/30 border-red-700/50'
              : 'bg-surface-800/40 border-surface-700/40'
          )}>
            <div className="flex-1">
              <p className={cn('text-sm font-bold', form.ignorar ? 'text-red-300' : 'text-surface-200')}>
                <EyeOff size={13} className="inline mr-1.5 -mt-0.5" />
                Ignorar Item Completamente
              </p>
              <p className="text-[10px] text-surface-400 mt-0.5">
                O item e toda sua família ficam fora de qualquer análise (Planejamento, Compras). Os dados importados não são excluídos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, ignorar: !f.ignorar }))}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0',
                form.ignorar ? 'bg-red-600' : 'bg-surface-600'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                form.ignorar ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>

          {/* Campos de Override — ocultos quando ignorar=true */}
          <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', form.ignorar && 'opacity-40 pointer-events-none')}>
            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
                Descrição Corrigida
                <span className="ml-1 text-surface-500 font-normal normal-case">(deixe em branco para não sobrepor)</span>
              </label>
              <input
                className={cn('input w-full text-sm', form.nomenclatura_override && 'border-amber-600/60 bg-amber-950/20')}
                placeholder={masterSelecionado?.nomenclatura ?? 'Nome original do item...'}
                value={form.nomenclatura_override}
                onChange={e => setForm(f => ({ ...f, nomenclatura_override: e.target.value }))}
              />
            </div>

            {/* Média Anual */}
            <div>
              <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
                Consumo Anual Corrigido <span className="text-surface-500 font-normal normal-case">(unidades/ano)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={cn('input w-full text-sm', form.media_anual_override && 'border-amber-600/60 bg-amber-950/20')}
                placeholder="Média anual atual calculada..."
                value={form.media_anual_override}
                onChange={e => setForm(f => ({ ...f, media_anual_override: e.target.value }))}
              />
              {form.media_anual_override && (
                <p className="text-[10px] text-amber-400 mt-1">
                  → Média mensal: {(Number(form.media_anual_override) / 12).toFixed(2)} un/mês
                </p>
              )}
            </div>

            {/* Preço Unitário */}
            <div>
              <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
                Preço Unitário Corrigido <span className="text-surface-500 font-normal normal-case">(R$)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={cn('input w-full text-sm', form.preco_unitario_override && 'border-amber-600/60 bg-amber-950/20')}
                placeholder="Preço unitário atual..."
                value={form.preco_unitario_override}
                onChange={e => setForm(f => ({ ...f, preco_unitario_override: e.target.value }))}
              />
              {form.preco_unitario_override && (
                <p className="text-[10px] text-amber-400 mt-1">
                  → {formatCurrency(Number(form.preco_unitario_override))} por unidade
                </p>
              )}
            </div>

            {/* Estoque */}
            <div>
              <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
                Estoque Atual Corrigido <span className="text-surface-500 font-normal normal-case">(unidades)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className={cn('input w-full text-sm', form.estoque_override && 'border-amber-600/60 bg-amber-950/20')}
                placeholder="Quantidade em estoque atual..."
                value={form.estoque_override}
                onChange={e => setForm(f => ({ ...f, estoque_override: e.target.value }))}
              />
            </div>

            {/* Observação */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1.5">
                Motivo da Correção <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={2}
                className={cn(
                  'input w-full text-sm resize-none',
                  !form.observacao.trim() && masterSelecionado && 'border-red-600/40'
                )}
                placeholder="Ex: item mudou de unidade 'metro' para 'rolo de 300m' — histórico estava em metros..."
                value={form.observacao}
                onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-3 pt-2 border-t border-surface-700/40">
            <button
              onClick={handleSalvar}
              disabled={!masterSelecionado || salvando}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border',
                'bg-amber-700/80 text-amber-100 border-amber-600/60',
                'hover:bg-amber-600 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-950/40',
                'active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              {salvando
                ? <><div className="w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />Salvando...</>
                : <><Save size={14} />Salvar Modificador</>}
            </button>

            {masterSelecionado && lista.find(m => m.cd_comp_master === masterSelecionado.cd_comp) && (
              <button
                onClick={() => handleRemover(masterSelecionado.cd_comp)}
                disabled={removendo === masterSelecionado.cd_comp}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 border border-red-800/40 hover:bg-red-900/20 transition-all disabled:opacity-40"
              >
                <Trash2 size={14} />
                Remover Override
              </button>
            )}

            <p className="ml-auto text-[10px] text-surface-500">
              Campos em branco não sobreporão os dados originais.
            </p>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO B: Itens Ignorados ── */}
      {lista.filter(m => m.ignorar === true).length > 0 && (
        <div className="card p-0 overflow-hidden border-red-900/40">
          <div className="px-5 py-4 bg-red-950/30 border-b border-red-900/40 flex items-center gap-2">
            <EyeOff size={14} className="text-red-400" />
            <span className="text-sm font-bold text-red-300">Itens Ignorados</span>
            <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-700/40 font-bold">
              {lista.filter(m => m.ignorar === true).length}
            </span>
            <span className="ml-2 text-[10px] text-red-400/70">Excluídos de todas as análises do sistema</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-red-950/20 text-surface-400 uppercase text-[9px] tracking-wider border-b border-red-900/30">
                  <th className="py-2.5 px-4 text-left font-semibold">MASTER</th>
                  <th className="py-2.5 px-3 text-left font-semibold hidden md:table-cell">Motivo</th>
                  <th className="py-2.5 px-3 text-left font-semibold hidden lg:table-cell">Ignorado em</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-900/20">
                {lista.filter(m => m.ignorar === true).map(mod => (
                  <tr key={mod.cd_comp_master} className="hover:bg-red-950/10 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-mono font-bold text-red-300 text-[11px]">{mod.cd_comp_master}</p>
                      <p className="text-surface-400 mt-0.5 text-[10px] italic">ignorado</p>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <p className="text-surface-300 max-w-[240px] line-clamp-2">{mod.observacao ?? '—'}</p>
                    </td>
                    <td className="py-3 px-3 text-surface-400 whitespace-nowrap hidden lg:table-cell">
                      {new Date(mod.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => editarModificador(mod)}
                          title="Editar / Restaurar"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/20 transition-colors text-[10px] font-semibold"
                        >
                          <Eye size={11} /> Restaurar
                        </button>
                        <button
                          onClick={() => handleRemover(mod.cd_comp_master)}
                          disabled={removendo === mod.cd_comp_master}
                          title="Remover modificador"
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        >
                          {removendo === mod.cd_comp_master
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SEÇÃO C: Lista de Modificadores Ativos ── */}
      <div className="card p-0 overflow-hidden border-surface-700/60">
        <div className="px-5 py-4 bg-surface-800/60 border-b border-surface-700/50 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" />
          <span className="text-sm font-bold text-surface-50">Correções Ativas</span>
          <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/30 font-bold">
            {lista.filter(m => !m.ignorar).length}
          </span>
        </div>

        {storeLoading ? (
          <div className="py-12"><LoadingSpinner text="Carregando modificadores..." /></div>
        ) : lista.filter(m => !m.ignorar).length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles size={28} className="mx-auto mb-3 text-surface-600" />
            <p className="text-sm text-surface-400">Nenhuma correção ativa.</p>
            <p className="text-xs text-surface-500 mt-1">Use o formulário acima para adicionar modificadores.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface-800/80 text-surface-400 uppercase text-[9px] tracking-wider border-b border-surface-700/50">
                  <th className="py-2.5 px-4 text-left font-semibold">MASTER</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Campos Corrigidos</th>
                  <th className="py-2.5 px-3 text-left font-semibold hidden md:table-cell">Motivo</th>
                  <th className="py-2.5 px-3 text-left font-semibold hidden lg:table-cell">Atualizado</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-700/40">
                {lista.filter(m => !m.ignorar).map(mod => (
                  <tr key={mod.cd_comp_master} className="hover:bg-amber-950/10 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-mono font-bold text-amber-300 text-[11px]">{mod.cd_comp_master}</p>
                      {mod.nomenclatura_override ? (
                        <p className="text-amber-200 mt-0.5 max-w-[200px] truncate font-medium" title={mod.nomenclatura_override}>
                          {mod.nomenclatura_override}
                        </p>
                      ) : (
                        <p className="text-surface-400 mt-0.5 max-w-[200px] truncate" title={nomenclaturasOriginais[mod.cd_comp_master] ?? ''}>
                          {nomenclaturasOriginais[mod.cd_comp_master] ?? <span className="italic text-surface-600">carregando...</span>}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <CamposBadges mod={mod} />
                      <div className="mt-1.5 space-y-0.5 text-[10px] text-surface-400">
                        {mod.media_anual_override != null && (
                          <p>Consumo: <span className="text-amber-300 font-semibold">{mod.media_anual_override} un/ano</span> → {(mod.media_anual_override/12).toFixed(2)} un/mês</p>
                        )}
                        {mod.preco_unitario_override != null && (
                          <p>Preço: <span className="text-amber-300 font-semibold">{formatCurrency(mod.preco_unitario_override)}</span></p>
                        )}
                        {mod.estoque_override != null && (
                          <p>Estoque: <span className="text-amber-300 font-semibold">{mod.estoque_override} un</span></p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <p className="text-surface-300 max-w-[200px] line-clamp-2" title={mod.observacao ?? ''}>
                        {mod.observacao ?? '—'}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-surface-400 whitespace-nowrap hidden lg:table-cell">
                      {new Date(mod.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => editarModificador(mod)}
                          title="Editar"
                          className="p-1.5 rounded-lg text-primary-400 hover:bg-primary-900/30 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleRemover(mod.cd_comp_master)}
                          disabled={removendo === mod.cd_comp_master}
                          title="Remover override"
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        >
                          {removendo === mod.cd_comp_master
                            ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info contextual */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-surface-800/30 border border-surface-700/30 text-xs text-surface-400">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-primary-400" />
        <div>
          <p className="font-semibold text-surface-300 mb-0.5">Como funcionam os modificadores</p>
          <p>Os dados originais importados (planilhas) <strong className="text-surface-200">nunca são alterados</strong>. Os modificadores são uma camada de sobreposição aplicada em tempo de execução. Ao remover um modificador, os cálculos voltam imediatamente aos valores originais em todas as telas.</p>
          <p className="mt-1">Telas afetadas: <span className="text-amber-400 font-medium">Planejamento</span> · <span className="text-amber-400 font-medium">Compras</span> · <span className="text-amber-400 font-medium">Produtos</span> (e o Excel exportado do Planejamento).</p>
        </div>
      </div>
    </div>
  )
}
