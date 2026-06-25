import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, TrendingDown, CheckCircle, FileText, Package, Clock } from 'lucide-react'
import { useQuery } from '@/hooks/useQuery'
import { getPregoes, getEstoque, getFornecimentos, getProdutos } from '@/lib/api'
import {
  enrichPregao, formatCurrency, formatDate, formatPercent, safeNum,
  agruparPorAno, mediaPonderada, safeDivide, calcCobertura, calcCriticidade,
  isConsumoRecorrente, cn,
} from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import type { PregaoCard, CriticidadeCompra, Produto, Estoque, Fornecimento } from '@/types'

const STATUS_LABEL: Record<string, string> = { ATIVO: 'Ativo', A_VENCER: 'A Vencer', VENCIDO: 'Vencido' }
const STATUS_CLASS: Record<string, string> = { ATIVO: 'badge-ativo', A_VENCER: 'badge-avencer', VENCIDO: 'badge-vencido' }
const CRIT_CLASS: Record<CriticidadeCompra, string> = {
  CRITICO: 'text-red-400', BAIXO: 'text-orange-400', NORMAL: 'text-amber-400', ALTO: 'text-emerald-400', SEM_HIST: 'text-surface-400',
}

function PregaoCardUI({ card, onClick }: { card: PregaoCard; onClick: () => void }) {
  const barWidth = Math.min(100, safeNum(card.percentual_empenhado))
  const barColor = card.status === 'VENCIDO' ? 'bg-red-500' : barWidth > 90 ? 'bg-amber-500' : 'bg-primary-500'
  return (
    <div className="card-hover" onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-xs text-surface-400 font-mono">{card.numero_pregao}</p>
          <p className="text-sm font-semibold text-surface-50 mt-0.5 line-clamp-2">{card.objeto}</p>
        </div>
        <span className={STATUS_CLASS[card.status]}>{STATUS_LABEL[card.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div>
          <p className="text-surface-400">Valor Total</p>
          <p className="font-semibold text-surface-100">{formatCurrency(card.valor_total)}</p>
        </div>
        <div>
          <p className="text-surface-400">Saldo Disponível</p>
          <p className={cn('font-semibold', card.saldo_disponivel <= 0 ? 'text-red-400' : 'text-emerald-400')}>
            {formatCurrency(card.saldo_disponivel)}
          </p>
        </div>
        <div>
          <p className="text-surface-400">Validade</p>
          <p className={cn('font-semibold', card.status === 'VENCIDO' ? 'text-red-400' : card.status === 'A_VENCER' ? 'text-amber-400' : 'text-surface-100')}>
            {formatDate(card.data_vencimento)}
          </p>
        </div>
        <div>
          <p className="text-surface-400">Itens</p>
          <p className="font-semibold text-surface-100">
            {card.quantidade_itens}
            {card.itens_criticos > 0 && <span className="ml-1 text-orange-400">({card.itens_criticos} críticos)</span>}
            {card.itens_esgotados > 0 && <span className="ml-1 text-red-400">({card.itens_esgotados} esgotados)</span>}
          </p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-surface-400 mb-1">
          <span>Empenhado</span>
          <span>{formatPercent(card.percentual_empenhado)}</span>
        </div>
        <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${barWidth}%` }} />
        </div>
      </div>
    </div>
  )
}

function AlertPanel({
  cards, masters, estoques, fornecimentos,
}: {
  cards: PregaoCard[]
  masters: Produto[]
  estoques: Estoque[]
  fornecimentos: Fornecimento[]
}) {
  const alertas = useMemo(() => {
    return masters.map(master => {
      const estoqueTotal = estoques
        .filter(e => e.cd_comp === master.cd_comp || e.cd_comp === master.cd_comp_master)
        .reduce((s, e) => s + safeNum(e.estoque_total), 0)
      const forn = fornecimentos.filter(
        f => f.cd_comp_master === master.cd_comp || f.cd_comp === master.cd_comp
      )
      const porAno = agruparPorAno(forn)
      const mediaPond = mediaPonderada(porAno)
      const mediaMensal = safeDivide(mediaPond, 12)
      const recorrente = isConsumoRecorrente(porAno, 3, 0.5)
      if (!recorrente) return null
      const cobertura = calcCobertura(estoqueTotal, mediaMensal)
      const crit = calcCriticidade(cobertura, mediaMensal > 0)
      const temPregao = cards.some(
        c => c.status !== 'VENCIDO' && (c.itens ?? []).some(i => i.cd_comp_master === master.cd_comp && safeNum(i.saldo_empenho) > 0)
      )
      return { master, cobertura, crit, temPregao }
    })
    .filter(Boolean)
    .filter(a => a!.crit === 'CRITICO' || a!.crit === 'BAIXO')
  }, [cards, masters, estoques, fornecimentos])

  if (alertas.length === 0) {
    return (
      <div className="card flex items-center gap-3 text-emerald-400">
        <CheckCircle size={20} />
        <span className="text-sm">Nenhum alerta crítico no momento.</span>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-surface-100 mb-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-400" /> Alertas de Estoque
      </h2>
      <div className="space-y-2">
        {alertas.slice(0, 8).map(a => a && (
          <div key={a.master.cd_comp} className="flex items-center justify-between text-xs py-2 border-b border-surface-700/50 last:border-0">
            <div>
              <p className="font-medium text-surface-100">{a.master.nomenclatura}</p>
              <p className="text-surface-400">{a.master.cd_comp} • {a.master.pn}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className={cn('font-semibold', CRIT_CLASS[a.crit])}>
                {a.cobertura < 9999 ? `${a.cobertura.toFixed(1)} meses` : '—'}
              </p>
              {!a.temPregao && <p className="text-red-400">Sem pregão ativo</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()

  const { data: pregoes, loading: loadingP, error: errorP, refetch } = useQuery(getPregoes)
  const { data: produtos } = useQuery(getProdutos)
  const { data: estoques } = useQuery(getEstoque)
  const { data: fornecimentos } = useQuery(getFornecimentos)

  const cards = useMemo(() => (pregoes ?? []).map(enrichPregao), [pregoes])
  const masters = useMemo(() => (produtos ?? []).filter(p => p.pos_familia === 'MASTER'), [produtos])

  const ativos = cards.filter(c => c.status === 'ATIVO').length
  const aVencer = cards.filter(c => c.status === 'A_VENCER').length
  const vencidos = cards.filter(c => c.status === 'VENCIDO').length
  const valorTotal = cards.filter(c => c.status !== 'VENCIDO').reduce((s, c) => s + c.valor_total, 0)

  if (loadingP) return <LoadingSpinner text="Carregando pregões..." />
  if (errorP) return <ErrorCard message={errorP} onRetry={refetch} />

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} className="text-primary-400" />
            <span className="stat-label">Pregões Ativos</span>
          </div>
          <span className="stat-value text-emerald-400">{ativos}</span>
          <span className="stat-sub">{aVencer} a vencer • {vencidos} vencidos</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={14} className="text-primary-400" />
            <span className="stat-label">Valor em Carteira</span>
          </div>
          <span className="stat-value text-sm">{formatCurrency(valorTotal)}</span>
          <span className="stat-sub">Pregões não vencidos</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Package size={14} className="text-primary-400" />
            <span className="stat-label">Produtos MASTER</span>
          </div>
          <span className="stat-value">{masters.length}</span>
          <span className="stat-sub">catalogados no sistema</span>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-amber-400" />
            <span className="stat-label">A Vencer (60 dias)</span>
          </div>
          <span className="stat-value text-amber-400">{aVencer}</span>
          <span className="stat-sub">iniciar novo processo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Cards de pregões */}
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-surface-200">Pregões Vigentes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map(card => (
              <PregaoCardUI key={card.id} card={card} onClick={() => navigate(`/pregoes/${card.id}`)} />
            ))}
          </div>
        </div>
        {/* Alertas */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-surface-200">Alertas</h2>
          <AlertPanel
            cards={cards}
            masters={masters}
            estoques={estoques ?? []}
            fornecimentos={fornecimentos ?? []}
          />
        </div>
      </div>
    </div>
  )
}
