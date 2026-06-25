import { useState, useEffect, useMemo } from 'react'
import {
  Banknote, Plus, Trash2, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, X, Info, RefreshCw, Share2
} from 'lucide-react'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { getSisFromPlanoInterno, getSiUnicoFromPlanoInterno, getListaPlanosInternos } from '@/lib/ementario'
import { getSiTitulo, formatCurrency, cn } from '@/lib/utils'
import type { NotaCredito } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const FONTE_PADRAO = '1000000000'
const ND_PADRAO = '339000'

type FormState = {
  ptres: string
  fonte_recursos: string
  natureza_despesa: string
  ugr: string
  plano_interno: string
  valor: string
  descricao: string
}

const FORM_INICIAL: FormState = {
  ptres: '',
  fonte_recursos: FONTE_PADRAO,
  natureza_despesa: ND_PADRAO,
  ugr: '',
  plano_interno: '',
  valor: '',
  descricao: '',
}

// ─── Cores por PI ────────────────────────────────────────────────────────────

const PI_COLORS: Record<string, string> = {
  'E4AVSUNCOLU': '#3b82f6',  // azul — combustíveis (01+02)
  'E4AVSUNQUIM': '#8b5cf6',  // roxo — químico (04+11)
  'E4AVSUNOUTR': '#6b7280',  // cinza — outros
  'E4AVSUNSIIN': '#6366f1',  // índigo — TI
  'E4AVSUNACEM': '#84cc16',  // verde-limão — embalagens
  'E4AVSUNUNIF': '#ec4899',  // rosa — uniformes
  'E4AVSUNMABI': '#a78bfa',  // lavanda — imóveis
  'E4AVSUNAERO': '#60a5fa',  // azul-claro — aviação
  'E4AVSUNARMA': '#fb923c',  // laranja — armamento
  'E4AVVTRVASL': '#4ade80',  // verde — veículos
}

function getPiColor(pi: string): string {
  return PI_COLORS[pi] ?? '#6b7280'
}

// ─── Card de grupo por PI ────────────────────────────────────────────────────

interface GrupoPI {
  pi: string
  sisCobertas: string[]
  notas: NotaCredito[]
  totalValor: number
}

function CardGrupoPI({
  grupo, onDelete, expanded, onToggle,
}: {
  grupo: GrupoPI
  onDelete: (id: string) => void
  expanded: boolean
  onToggle: () => void
}) {
  const cor = getPiColor(grupo.pi)
  const compartilhado = grupo.sisCobertas.length > 1

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all duration-200"
      style={{ borderColor: `${cor}35`, background: `${cor}08` }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-mono text-[10px] font-bold leading-tight text-center"
          style={{ background: `${cor}25`, color: cor }}
        >
          {grupo.pi.replace('E4AVSUN', '').replace('E4AVV', '')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs font-semibold text-surface-50">{grupo.pi}</p>
            {compartilhado && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: `${cor}20`, color: cor }}>
                <Share2 size={8} /> pool compartilhado
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {grupo.sisCobertas.map(si => {
              const siPad = si.padStart(2, '0')
              return (
                <span key={si} className="text-[9px] text-surface-400 bg-surface-700/60 px-1.5 py-0.5 rounded">
                  SI {siPad} — {getSiTitulo(siPad) || `Subitem ${siPad}`}
                </span>
              )
            })}
          </div>
          <p className="text-xs text-surface-400 mt-1">
            {grupo.notas.length} nota{grupo.notas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold" style={{ color: cor }}>
            {formatCurrency(grupo.totalValor)}
          </p>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">
            {compartilhado ? 'pool disponível' : 'disponível'}
          </p>
        </div>
        <span className="text-surface-400 ml-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="border-t divide-y" style={{ borderColor: `${cor}20` }}>
          {grupo.notas.map(nc => (
            <div
              key={nc.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs text-surface-400 font-mono">PTRES: {nc.ptres}</span>
                  <span className="text-xs text-surface-400 font-mono">UGR: {nc.ugr}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-surface-400">
                  <span>Fonte: {nc.fonte_recursos}</span>
                  <span>ND: {nc.natureza_despesa}</span>
                  {nc.descricao && (
                    <span className="text-surface-300 italic truncate max-w-[240px]">{nc.descricao}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-surface-50">{formatCurrency(Number(nc.valor))}</p>
                <p className="text-[10px] text-surface-500">
                  {new Date(nc.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 ml-1 mt-0.5"
                title="Excluir nota de crédito"
                onClick={() => onDelete(nc.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function NotasCredito() {
  const { notas, fetched, loading, error, fetchNotas, addNota, removeNota, totalPorPI } = useNotasCreditoStore()
  const [form, setForm] = useState<FormState>(FORM_INICIAL)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)
  const [succMsg, setSuccMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // SIs cobertos pelo PI selecionado
  const sisDoPI = useMemo(() =>
    form.plano_interno ? getSisFromPlanoInterno(form.plano_interno) : [],
    [form.plano_interno]
  )

  const piCompartilhado = sisDoPI.length > 1

  // Lista de PIs disponíveis no ementário
  const planosDisponiveis = useMemo(() => getListaPlanosInternos(), [])

  useEffect(() => {
    if (!fetched) fetchNotas()
  }, [fetched, fetchNotas])

  // Agrupamento de NCs por PI
  const grupos = useMemo((): GrupoPI[] => {
    const map = new Map<string, NotaCredito[]>()
    notas.forEach(nc => {
      const pi = nc.plano_interno || 'OUTROS'
      const arr = map.get(pi) || []
      arr.push(nc)
      map.set(pi, arr)
    })
    return Array.from(map.entries())
      .map(([pi, ncs]) => ({
        pi,
        sisCobertas: getSisFromPlanoInterno(pi),
        notas: ncs,
        totalValor: ncs.reduce((s, nc) => s + Number(nc.valor), 0),
      }))
      .sort((a, b) => a.pi.localeCompare(b.pi))
  }, [notas])

  const totalGeral = useMemo(() =>
    Object.values(totalPorPI).reduce((s, v) => s + v, 0), [totalPorPI])

  const toggleExpand = (pi: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(pi) ? next.delete(pi) : next.add(pi)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrForm(null)
    setSuccMsg(null)

    if (!form.ptres.trim()) return setErrForm('PTRES é obrigatório.')
    if (!form.ugr.trim()) return setErrForm('UGR é obrigatório.')
    if (!form.plano_interno.trim()) return setErrForm('Selecione o Plano Interno.')
    if (sisDoPI.length === 0) return setErrForm('Plano Interno não encontrado no Ementário.')

    const valor = parseFloat(form.valor.replace(',', '.'))
    if (!valor || valor <= 0) return setErrForm('Valor deve ser maior que zero.')

    // O SI armazenado é o único SI (se PI→1 SI) ou vazio (se PI→múltiplos SIs)
    const siParaArmazenar = getSiUnicoFromPlanoInterno(form.plano_interno) ?? ''

    setSalvando(true)
    const err = await addNota({
      ptres: form.ptres.trim().toUpperCase(),
      fonte_recursos: form.fonte_recursos.trim() || FONTE_PADRAO,
      natureza_despesa: form.natureza_despesa.trim() || ND_PADRAO,
      ugr: form.ugr.trim().toUpperCase(),
      plano_interno: form.plano_interno.trim().toUpperCase(),
      si: siParaArmazenar,
      valor,
      descricao: form.descricao.trim() || null,
    })
    setSalvando(false)

    if (err) {
      setErrForm(`Erro ao salvar: ${err}`)
    } else {
      setSuccMsg('Nota de Crédito cadastrada com sucesso!')
      setForm(FORM_INICIAL)
      setExpandidos(prev => new Set([...prev, form.plano_interno.toUpperCase()]))
      setTimeout(() => setSuccMsg(null), 4000)
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmDelete(null)
    const err = await removeNota(id)
    if (err) setErrForm(`Erro ao excluir: ${err}`)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-surface-50 flex items-center gap-2">
            <Banknote className="text-emerald-400" size={22} />
            Notas de Crédito
          </h2>
          <p className="text-sm text-surface-400 mt-1">
            Créditos orçamentários vinculados ao Plano Interno (PI). Quando um PI cobre múltiplos Subitens, o saldo é <strong className="text-surface-300">compartilhado</strong> entre eles.
          </p>
        </div>
        <button
          onClick={() => fetchNotas()}
          className="btn-secondary !py-2 !px-3 flex items-center gap-1.5 text-xs"
          disabled={loading}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Cards de resumo por PI */}
      {grupos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {grupos.map(g => (
            <div
              key={g.pi}
              className="rounded-xl p-3 border cursor-pointer hover:scale-[1.02] transition-transform"
              style={{ borderColor: `${getPiColor(g.pi)}40`, background: `${getPiColor(g.pi)}12` }}
              onClick={() => {
                toggleExpand(g.pi)
                document.getElementById(`grupo-pi-${g.pi}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              {g.sisCobertas.length > 1 && (
                <div className="flex items-center gap-1 mb-1">
                  <Share2 size={8} style={{ color: getPiColor(g.pi) }} />
                  <span className="text-[9px] font-semibold" style={{ color: getPiColor(g.pi) }}>pool</span>
                </div>
              )}
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider mb-1" style={{ color: getPiColor(g.pi) }}>
                {g.pi}
              </p>
              <p className="text-[10px] text-surface-400 leading-tight mb-2">
                {g.sisCobertas.map(s => `SI ${s.padStart(2, '0')}`).join(' + ')}
              </p>
              <p className="text-base font-bold text-surface-50">{formatCurrency(g.totalValor)}</p>
            </div>
          ))}
          <div className="rounded-xl p-3 border border-emerald-500/30 bg-emerald-500/10">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-emerald-400">Total Geral</p>
            <p className="text-[10px] text-surface-300 leading-tight mb-2">Todos os Planos Internos</p>
            <p className="text-base font-bold text-emerald-300">{formatCurrency(totalGeral)}</p>
          </div>
        </div>
      )}

      {/* Formulário */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-100 mb-4 flex items-center gap-2">
          <Plus size={16} className="text-primary-400" />
          Nova Nota de Crédito
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PTRES + UGR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="stat-label block mb-1.5">PTRES <span className="text-red-400">*</span></label>
              <input
                className="input w-full font-mono text-sm uppercase"
                placeholder="Ex: 123456"
                value={form.ptres}
                onChange={e => setForm(p => ({ ...p, ptres: e.target.value }))}
              />
            </div>
            <div>
              <label className="stat-label block mb-1.5">UGR <span className="text-red-400">*</span></label>
              <input
                className="input w-full font-mono text-sm uppercase"
                placeholder="Ex: 160001"
                value={form.ugr}
                onChange={e => setForm(p => ({ ...p, ugr: e.target.value }))}
              />
            </div>
          </div>

          {/* Fonte + ND */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="stat-label block mb-1.5">
                Fonte de Recursos
                <span className="ml-1 text-surface-500 text-[10px] normal-case">(padrão: {FONTE_PADRAO})</span>
              </label>
              <input
                className="input w-full font-mono text-sm"
                value={form.fonte_recursos}
                onChange={e => setForm(p => ({ ...p, fonte_recursos: e.target.value }))}
              />
            </div>
            <div>
              <label className="stat-label block mb-1.5">
                Natureza da Despesa
                <span className="ml-1 text-surface-500 text-[10px] normal-case">(padrão: {ND_PADRAO})</span>
              </label>
              <input
                className="input w-full font-mono text-sm"
                value={form.natureza_despesa}
                onChange={e => setForm(p => ({ ...p, natureza_despesa: e.target.value }))}
              />
            </div>
          </div>

          {/* Plano Interno + info de SIs cobertas */}
          <div>
            <label className="stat-label block mb-1.5">
              Plano Interno <span className="text-red-400">*</span>
            </label>
            <select
              className="input w-full font-mono text-sm"
              value={form.plano_interno}
              onChange={e => setForm(p => ({ ...p, plano_interno: e.target.value }))}
            >
              <option value="">— Selecione o Plano Interno —</option>
              {planosDisponiveis.map(p => (
                <option key={p.planoInterno} value={p.planoInterno}>
                  {p.planoInterno}
                  {' — '}
                  {p.sis.length === 1
                    ? `SI ${p.sis[0].padStart(2, '0')}: ${getSiTitulo(p.sis[0]) || 'Subitem ' + p.sis[0]}`
                    : `Pool SI ${p.sis.map(s => s.padStart(2, '0')).join('+')}`
                  }
                </option>
              ))}
            </select>

            {/* Info box sobre os SIs cobertos */}
            {sisDoPI.length > 0 && (
              <div className={cn(
                'mt-2 rounded-lg px-3 py-2.5 border text-xs',
                piCompartilhado
                  ? 'bg-amber-950/20 border-amber-700/30'
                  : 'bg-emerald-950/20 border-emerald-700/30'
              )}>
                {piCompartilhado ? (
                  <div className="flex items-start gap-2">
                    <Share2 size={12} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-amber-300">
                        Pool compartilhado — este crédito cobre {sisDoPI.length} Subitens:
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {sisDoPI.map(si => {
                          const siPad = si.padStart(2, '0')
                          return (
                            <span key={si} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-900/40 text-amber-300 border border-amber-700/30">
                              SI {siPad} — {getSiTitulo(siPad)}
                            </span>
                          )
                        })}
                      </div>
                      <p className="text-amber-400/70 mt-1.5 text-[10px]">
                        O saldo desta NC é consumido em conjunto por todos os Subitens acima nos menus Compras e Planejamento.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    <span>
                      Subitem único: <strong>SI {sisDoPI[0].padStart(2, '0')} — {getSiTitulo(sisDoPI[0])}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Valor + Descrição */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="stat-label block mb-1.5">Valor (R$) <span className="text-red-400">*</span></label>
              <input
                className="input w-full text-sm font-semibold"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.valor}
                onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
              />
            </div>
            <div>
              <label className="stat-label block mb-1.5">Descrição (opcional)</label>
              <input
                className="input w-full text-sm"
                placeholder="Observação livre sobre esta nota"
                value={form.descricao}
                onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              />
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 text-xs text-surface-400 bg-surface-700/40 rounded-lg px-3 py-2">
            <Info size={13} className="shrink-0 mt-0.5 text-sky-400" />
            <span>
              O orçamento é controlado no nível do <strong className="text-surface-300">Plano Interno</strong>.
              Subitens cobertos pelo mesmo PI compartilham um único pool de crédito nos menus{' '}
              <strong className="text-surface-300">Compras</strong> e <strong className="text-surface-300">Planejamento</strong>.
            </span>
          </div>

          {errForm && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              {errForm}
            </div>
          )}
          {succMsg && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} />
              {succMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={salvando}>
              {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {salvando ? 'Cadastrando...' : 'Cadastrar Nota de Crédito'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de NCs por PI */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider flex items-center gap-2">
          <Banknote size={14} className="text-emerald-400" />
          Créditos Cadastrados
          {notas.length > 0 && (
            <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 px-1.5 py-0.5 rounded-full">
              {notas.length} nota{notas.length !== 1 ? 's' : ''}
            </span>
          )}
        </h3>

        {loading && !fetched && (
          <div className="text-center text-surface-400 text-sm py-10">Carregando notas de crédito...</div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-3">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}
        {!loading && fetched && notas.length === 0 && (
          <div className="text-center text-surface-400 text-sm py-12 card">
            <Banknote size={32} className="mx-auto mb-3 text-surface-600" />
            <p>Nenhuma nota de crédito cadastrada.</p>
            <p className="text-xs mt-1">Use o formulário acima para cadastrar a primeira NC.</p>
          </div>
        )}

        {grupos.map(grupo => (
          <div key={grupo.pi} id={`grupo-pi-${grupo.pi}`}>
            <CardGrupoPI
              grupo={grupo}
              onDelete={id => setConfirmDelete(id)}
              expanded={expandidos.has(grupo.pi)}
              onToggle={() => toggleExpand(grupo.pi)}
            />
          </div>
        ))}
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-800 border border-surface-600/40 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-900/40 flex items-center justify-center">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-50">Excluir Nota de Crédito</p>
                <p className="text-xs text-surface-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-surface-300 mb-5">
              O saldo do pool do Plano Interno será reduzido. Tem certeza?
            </p>
            <div className="flex gap-3">
              <button className="flex-1 btn-secondary flex items-center justify-center gap-1.5" onClick={() => setConfirmDelete(null)}>
                <X size={14} /> Cancelar
              </button>
              <button
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5"
                onClick={() => handleDelete(confirmDelete)}
              >
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
