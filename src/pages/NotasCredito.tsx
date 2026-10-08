import { useState, useEffect, useMemo } from 'react'
import {
  Banknote, Plus, Trash2, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, X, Info, RefreshCw, Share2, Pencil
} from 'lucide-react'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { getSisFromPlanoInterno, getListaPlanosInternos } from '@/lib/ementario'
import { getSiTitulo, formatCurrency, cn } from '@/lib/utils'
import type { NotaCredito } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const FONTE_PADRAO = '1000000000'
const ND_PADRAO = '339000'

type FormState = {
  numero_nc: string
  data_emissao: string
  ug_emitente: string
  ptres: string
  fonte_recursos: string
  natureza_despesa: string
  ugr: string
  plano_interno: string
  si_manual: string      // SI escolhido manualmente (para PIs com múltiplos SIs)
  valor: string
  descricao: string
}

const FORM_INICIAL: FormState = {
  numero_nc: '',
  data_emissao: '',
  ug_emitente: '',
  ptres: '',
  fonte_recursos: FONTE_PADRAO,
  natureza_despesa: ND_PADRAO,
  ugr: '',
  plano_interno: '',
  si_manual: '',
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
  saldoDisponivel: number
  gasto: number
}

function CardGrupoPI({
  grupo, onDelete, onEdit, onEncerrar, expanded, onToggle, saldoPorNC
}: {
  grupo: GrupoPI
  onDelete: (id: string) => void
  onEdit: (nc: NotaCredito) => void
  onEncerrar: (nc: NotaCredito, saldo: number) => void
  expanded: boolean
  onToggle: () => void
  saldoPorNC: Record<string, number>
}) {
  const cor = getPiColor(grupo.pi)
  const compartilhado = grupo.sisCobertas.length > 1
  const houveGastoGrupo = grupo.totalValor - grupo.saldoDisponivel > 0.009

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
          <p className={cn(
            "text-[10px] text-surface-400 font-semibold mb-0.5 decoration-surface-500/50",
            houveGastoGrupo && "line-through"
          )}>
            Bruto: {formatCurrency(grupo.totalValor)}
          </p>
          <p className="text-base font-bold leading-none" style={{ color: cor }}>
            {formatCurrency(grupo.saldoDisponivel)}
          </p>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider mt-1">
            {compartilhado ? 'pool líquido' : 'líquido'}
          </p>
        </div>
        <span className="text-surface-400 ml-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {expanded && (
        <div className="border-t divide-y" style={{ borderColor: `${cor}20` }}>
          {grupo.notas.map(nc => {
            const saldoAtual = saldoPorNC[nc.id] ?? Number(nc.valor)
            const esgotada = saldoAtual <= 0
            const houveGastoNC = Number(nc.valor) - saldoAtual > 0.009
            const siResolvida = nc.si?.trim()
              ? nc.si.trim().padStart(2, '0')
              : (grupo.sisCobertas.length === 1 ? grupo.sisCobertas[0].padStart(2, '0') : null)
            const siTitulo = siResolvida ? getSiTitulo(siResolvida) : ''
            
            return (
            <div
              key={nc.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors group",
                esgotada && "opacity-60 grayscale-[0.5]"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {nc.status === 'ENCERRADA' && (
                    <span className="text-[10px] font-bold text-surface-400 bg-surface-700/50 px-1.5 py-0.5 rounded border border-surface-600/50">
                      ENCERRADA
                    </span>
                  )}
                  {nc.numero_nc && (
                    <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-900/30 border border-emerald-700/30 px-1.5 py-0.5 rounded">
                      {nc.numero_nc}
                    </span>
                  )}
                  {siResolvida ? (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5 shrink-0"
                      style={{
                        backgroundColor: `${cor}20`,
                        borderColor: `${cor}50`,
                        color: cor,
                      }}
                      title={`SI ${siResolvida} — ${siTitulo || `Subitem ${siResolvida}`}`}
                    >
                      <span className="font-mono font-bold">SI {siResolvida}</span>
                      {siTitulo && (
                        <span className="text-[10px] font-normal opacity-90 hidden sm:inline">
                          — {siTitulo}
                        </span>
                      )}
                    </span>
                  ) : (compartilhado ? (
                    <span
                      className="text-[10px] text-surface-400 bg-surface-800/80 border border-surface-700/60 px-1.5 py-0.5 rounded italic shrink-0"
                      title="Esta NC não foi vinculada a uma SI específica"
                    >
                      SI: Pool Geral
                    </span>
                  ) : null)}
                  {nc.data_emissao && (
                    <span className="text-xs text-surface-300">
                      {new Date(nc.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  {nc.ug_emitente && (
                    <span className="text-xs font-mono text-sky-300 bg-sky-900/20 border border-sky-700/30 px-1.5 py-0.5 rounded">
                      UG {nc.ug_emitente}
                    </span>
                  )}
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
                <p className={cn("text-[10px] text-surface-400 mb-0.5", houveGastoNC && "line-through")}>
                  Emissão: {formatCurrency(Number(nc.valor))}
                </p>
                <p className={cn("text-sm font-semibold", esgotada ? "text-red-400" : "text-emerald-400")}>
                  {formatCurrency(saldoAtual)}
                </p>
                <p className="text-[10px] text-surface-500 mt-1">
                  {new Date(nc.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex flex-col items-center shrink-0 ml-1 mt-0.5 space-y-1">
                {nc.status !== 'ENCERRADA' && !esgotada && (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-400 hover:text-amber-300"
                    title="Encerrar nota de crédito"
                    onClick={() => onEncerrar(nc, saldoAtual)}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-400 hover:text-primary-300"
                  title="Editar nota de crédito"
                  onClick={() => onEdit(nc)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                  title="Excluir nota de crédito"
                  onClick={() => onDelete(nc.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>

            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function NotasCredito() {
  const { notas, fetched, loading, error, fetchNotas, addNota, updateNota, removeNota, saldoPorNC } = useNotasCreditoStore()
  const [form, setForm] = useState<FormState>(FORM_INICIAL)
  const [editandoId, setEditandoId] = useState<string | null>(null)
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

  // Quando o PI muda, limpar o SI manual se ele não pertencer mais ao novo PI
  useEffect(() => {
    if (form.si_manual && !sisDoPI.includes(form.si_manual)) {
      setForm(p => ({ ...p, si_manual: sisDoPI.length === 1 ? sisDoPI[0] : '' }))
    }
  }, [sisDoPI, form.si_manual])

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
      const pi = nc.plano_interno?.trim() || 'OUTROS'
      const arr = map.get(pi) || []
      arr.push(nc)
      map.set(pi, arr)
    })
    return Array.from(map.entries())
      .map(([pi, ncs]) => {
        const totalValor = ncs.reduce((s, nc) => s + Number(nc.valor), 0)
        const saldoDisponivel = ncs.reduce((s, nc) => s + (saldoPorNC[nc.id] ?? Number(nc.valor)), 0)
        const gasto = totalValor - saldoDisponivel
        return {
          pi,
          sisCobertas: getSisFromPlanoInterno(pi),
          notas: ncs,
          totalValor,
          saldoDisponivel,
          gasto
        }
      })
      .sort((a, b) => a.pi.localeCompare(b.pi))
  }, [notas, saldoPorNC])

  const totalGeral = useMemo(() => {
    return grupos.reduce((s, g) => s + g.saldoDisponivel, 0)
  }, [grupos])

  const toggleExpand = (pi: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(pi) ? next.delete(pi) : next.add(pi)
      return next
    })
  }

  const handleEdit = (nc: NotaCredito) => {
    setEditandoId(nc.id)
    setForm({
      numero_nc: nc.numero_nc || '',
      data_emissao: nc.data_emissao || '',
      ug_emitente: nc.ug_emitente || '',
      ptres: nc.ptres,
      fonte_recursos: nc.fonte_recursos,
      natureza_despesa: nc.natureza_despesa,
      ugr: nc.ugr,
      plano_interno: nc.plano_interno,
      si_manual: nc.si || '',
      valor: nc.valor.toString().replace('.', ','),
      descricao: nc.descricao || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setErrForm(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrForm(null)
    setSuccMsg(null)

    if (!form.ptres.trim()) return setErrForm('PTRES é obrigatório.')
    if (!form.ugr.trim()) return setErrForm('UGR é obrigatório.')
    if (!form.ug_emitente.trim()) return setErrForm('UG Emitente é obrigatória.')
    if (!form.plano_interno.trim()) return setErrForm('Selecione o Plano Interno.')
    if (sisDoPI.length === 0) return setErrForm('Plano Interno não encontrado no Ementário.')

    // Valida formato do Nr NC se preenchido: aaaaNCxxxxxx
    const numeroNc = form.numero_nc.trim().toUpperCase()
    if (numeroNc && !/^\d{4}NC\d+$/.test(numeroNc)) {
      return setErrForm('Nº da NC inválido. Use o formato aaaaNCxxxxxx (ex: 2026NC409600).')
    }

    const valor = parseFloat(form.valor.replace(',', '.'))
    if (!valor || valor <= 0) return setErrForm('Valor deve ser maior que zero.')

    // SI: manual (para PIs com múltiplos SIs) ou único derivado do ementário
    const siParaArmazenar = piCompartilhado
      ? (form.si_manual || '')
      : (sisDoPI[0] || '')

    if (piCompartilhado && !siParaArmazenar) {
      return setErrForm('Selecione o Subitem (SI) específico desta NC.')
    }

    setSalvando(true)

    const payload = {
      numero_nc: numeroNc || null,
      data_emissao: form.data_emissao.trim() || null,
      ug_emitente: form.ug_emitente.trim().toUpperCase(),
      ptres: form.ptres.trim().toUpperCase(),
      fonte_recursos: form.fonte_recursos.trim() || FONTE_PADRAO,
      natureza_despesa: form.natureza_despesa.trim() || ND_PADRAO,
      ugr: form.ugr.trim().toUpperCase(),
      plano_interno: form.plano_interno.trim().toUpperCase(),
      si: siParaArmazenar,
      valor,
      descricao: form.descricao.trim() || null,
      status: 'ATIVA' as const,
    }

    const err = editandoId
      ? await updateNota(editandoId, payload)
      : await addNota(payload)
      
    setSalvando(false)

    if (err) {
      setErrForm(`Erro ao salvar: ${err}`)
    } else {
      setSuccMsg(editandoId ? 'Nota de Crédito atualizada com sucesso!' : 'Nota de Crédito cadastrada com sucesso!')
      setForm(FORM_INICIAL)
      setEditandoId(null)
      setExpandidos(prev => new Set([...prev, form.plano_interno.toUpperCase()]))
      setTimeout(() => setSuccMsg(null), 4000)
    }
  }

  const handleEncerrar = async (nc: NotaCredito, saldoRestante: number) => {
    if (confirm(`Tem certeza que deseja encerrar esta Nota de Crédito?\n\nO saldo restante de ${formatCurrency(saldoRestante)} será DESCARTADO do orçamento disponível. Essa ação não afeta os pedidos já realizados com esta nota.`)) {
      setSalvando(true)
      const err = await updateNota(nc.id, { status: 'ENCERRADA' })
      setSalvando(false)
      if (err) {
        setErrForm(`Erro ao encerrar NC: ${err}`)
      } else {
        setSuccMsg('Nota de Crédito encerrada com sucesso.')
        setTimeout(() => setSuccMsg(null), 4000)
      }
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
              <p className="text-base font-bold text-surface-50">{formatCurrency(g.saldoDisponivel)}</p>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            {editandoId ? (
              <><Pencil size={16} className="text-amber-400" /> Atualizar Nota de Crédito</>
            ) : (
              <><Plus size={16} className="text-primary-400" /> Nova Nota de Crédito</>
            )}
          </h3>
          {editandoId && (
            <button
              onClick={handleCancelEdit}
              className="text-xs text-surface-400 hover:text-surface-200 transition-colors underline underline-offset-2"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nº da NC + Data de Emissão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="stat-label block mb-1.5">
                Nº da NC
                <span className="ml-1 text-surface-500 text-[10px] normal-case">(ex: 2026NC409600)</span>
              </label>
              <input
                className="input w-full font-mono text-sm uppercase tracking-wider"
                placeholder="2026NC409600"
                value={form.numero_nc}
                onChange={e => setForm(p => ({ ...p, numero_nc: e.target.value }))}
              />
            </div>
            <div>
              <label className="stat-label block mb-1.5">Data de Emissão</label>
              <input
                className="input w-full text-sm"
                type="date"
                value={form.data_emissao}
                onChange={e => setForm(p => ({ ...p, data_emissao: e.target.value }))}
              />
            </div>
          </div>

          {/* UG Emitente */}
          <div>
            <label className="stat-label block mb-1.5">
              UG Emitente <span className="text-red-400">*</span>
              <span className="ml-1 text-surface-500 text-[10px] normal-case">(UG que emitiu a NC)</span>
            </label>
            <input
              className="input w-full font-mono text-sm uppercase tracking-wider"
              placeholder="Ex: 160504"
              value={form.ug_emitente}
              onChange={e => setForm(p => ({ ...p, ug_emitente: e.target.value }))}
              required
            />
          </div>

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

            {/* Info box sobre os SIs cobertos — ou seletor de SI manual */}
            {sisDoPI.length > 0 && (
              <div className={cn(
                'mt-2 rounded-lg px-3 py-2.5 border text-xs',
                piCompartilhado
                  ? 'bg-amber-950/20 border-amber-700/30'
                  : 'bg-emerald-950/20 border-emerald-700/30'
              )}>
                {piCompartilhado ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Share2 size={12} className="text-amber-400 shrink-0" />
                      <span className="font-semibold text-amber-300">
                        PI com múltiplos SIs — selecione o SI específico desta NC:
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sisDoPI.map(si => {
                        const siPad = si.padStart(2, '0')
                        const selecionado = form.si_manual === si || form.si_manual === siPad
                        return (
                          <button
                            key={si}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, si_manual: si }))}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all',
                              selecionado
                                ? 'bg-primary-600/40 text-primary-200 border-primary-500/60 ring-1 ring-primary-400'
                                : 'bg-amber-900/30 text-amber-300 border-amber-700/30 hover:bg-amber-800/40'
                            )}
                          >
                            SI {siPad} — {getSiTitulo(siPad) || `Subitem ${siPad}`}
                          </button>
                        )
                      })}
                    </div>
                    {!form.si_manual && (
                      <p className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={10} /> Selecione um SI para continuar.
                      </p>
                    )}
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
                type="text"
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

          {/* Info + Ações */}
          <div className="flex items-start gap-2 text-xs text-surface-400 bg-surface-700/40 rounded-lg px-3 py-2">
            <Info size={13} className="shrink-0 mt-0.5 text-sky-400" />
            <span>
              O orçamento é controlado no nível do <strong className="text-surface-300">Plano Interno</strong>.
              Subitens cobertos pelo mesmo PI compartilham um único pool de crédito.
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

          <div className="flex justify-end gap-3 pt-2">
            {editandoId && (
              <button type="button" className="btn-secondary" onClick={handleCancelEdit} disabled={salvando}>
                Cancelar
              </button>
            )}
            <button type="submit" className="btn-primary flex items-center gap-2" disabled={salvando}>
              {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {salvando ? 'Salvando...' : editandoId ? 'Atualizar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de NCs por PI */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider flex items-center gap-2">
          <Banknote size={14} className="text-emerald-400" />
          Créditos Cadastrados
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
          </div>
        )}

        {grupos.map(grupo => (
          <div key={grupo.pi} id={`grupo-pi-${grupo.pi}`}>
            <CardGrupoPI
              grupo={grupo}
              onDelete={id => setConfirmDelete(id)}
              onEdit={handleEdit}
              onEncerrar={handleEncerrar}
              expanded={expandidos.has(grupo.pi)}
              onToggle={() => toggleExpand(grupo.pi)}
              saldoPorNC={saldoPorNC}
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
