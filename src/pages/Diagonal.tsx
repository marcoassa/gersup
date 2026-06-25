import { useMemo, useState } from 'react'
import { addMonths, format, parseISO, differenceInMonths, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useQuery } from '@/hooks/useQuery'
import { getPregoes } from '@/lib/api'
import { enrichPregao, formatDate } from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import type { PregaoCard } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  ATIVO: '#22c55e',
  A_VENCER: '#f59e0b',
  VENCIDO: '#ef4444',
}

const CELL_W = 32 // px por mês

function getTimelineMonths(): Date[] {
  const start = new Date(2026, 0, 1) // Jan 2026
  return Array.from({ length: 36 }, (_, i) => addMonths(start, i))
}

function MonthHeader({ months }: { months: Date[] }) {
  let lastYear = -1
  return (
    <div className="flex">
      <div style={{ minWidth: 200 }} />
      {months.map((m, i) => {
        const year = m.getFullYear()
        const showYear = year !== lastYear
        if (showYear) lastYear = year
        return (
          <div key={i} style={{ minWidth: CELL_W }} className="relative">
            {showYear && (
              <div className="absolute -top-5 left-0 text-[11px] text-surface-100 font-bold whitespace-nowrap tracking-wide">
                {year}
              </div>
            )}
            <div className="text-[10px] text-surface-200 font-semibold text-center border-l border-surface-600/40 pb-1">
              {format(m, 'MMM', { locale: ptBR }).toUpperCase()}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PregaoRow({ card, months, today }: { card: PregaoCard; months: Date[]; today: Date }) {
  const endMonth = startOfMonth(parseISO(card.data_vencimento))
  const startMonth = addMonths(endMonth, -12)
  const inicioProcesso = addMonths(endMonth, -4)
  const baseMonth = months[0]

  const actualColStart = differenceInMonths(startMonth, baseMonth)
  const colStart = Math.max(0, actualColStart)
  const colEnd = differenceInMonths(endMonth, baseMonth)
  const colInicioProcesso = differenceInMonths(inicioProcesso, baseMonth)
  const colToday = differenceInMonths(startOfMonth(today), baseMonth)
  const barWidth = Math.max(0, colEnd - colStart)

  return (
    <div className="flex items-center group hover:bg-surface-700/30 rounded transition-colors">
      {/* Label */}
      <div style={{ minWidth: 200 }} className="pr-3 py-2 flex flex-col shrink-0">
        <span className="text-xs font-mono font-bold text-primary-300">{card.numero_pregao}</span>
        <span className="text-[10px] text-surface-300 truncate max-w-[190px]">{card.objeto.slice(0, 40)}…</span>
      </div>
      {/* Bars */}
      <div className="flex items-center relative" style={{ minWidth: months.length * CELL_W }}>
        {/* Today line */}
        {colToday >= 0 && colToday < months.length && (
          <div
            className="absolute top-0 bottom-0 w-px bg-primary-400/60 z-10"
            style={{ left: colToday * CELL_W }}
            title="Hoje"
          />
        )}
        {/* Vigência bar */}
        {barWidth > 0 && colStart < months.length && colEnd >= 0 && (
          <div
            className="absolute h-5 rounded opacity-80 group-hover:opacity-100 transition-opacity"
            style={{
              left: colStart * CELL_W,
              width: barWidth * CELL_W,
              backgroundColor: STATUS_COLOR[card.status],
              borderTopLeftRadius: actualColStart < 0 ? 0 : undefined,
              borderBottomLeftRadius: actualColStart < 0 ? 0 : undefined,
            }}
            title={`Vigência: 1 ano até ${formatDate(card.data_vencimento)}`}
          />
        )}
        {/* Início processo marker */}
        {colInicioProcesso >= 0 && colInicioProcesso < months.length && (
          <div
            className="absolute flex flex-col items-center z-20"
            style={{ left: colInicioProcesso * CELL_W - 5 }}
            title={`Iniciar novo processo: ${format(inicioProcesso, 'dd/MM/yyyy')}`}
          >
            <div className="w-3 h-3 rotate-45 bg-amber-400 border-2 border-surface-800" />
          </div>
        )}
        {/* Month grid lines */}
        {months.map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l border-surface-700/20" style={{ left: i * CELL_W }} />
        ))}
      </div>
    </div>
  )
}

export default function Diagonal() {
  const today = new Date()
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')

  const { data, loading, error } = useQuery(getPregoes)

  const cards = useMemo(() => {
    if (!data) return []
    const all = data.map(enrichPregao)
    return filtroStatus === 'TODOS' ? all : all.filter(c => c.status === filtroStatus)
  }, [data, filtroStatus])

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)),
    [cards]
  )

  const months = useMemo(() => getTimelineMonths(), [])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card flex flex-wrap gap-4 items-center p-4">
        <span className="text-sm font-semibold text-surface-200">Diagonal dos Pregões</span>
        <div className="flex gap-2 ml-auto">
          {['TODOS', 'ATIVO', 'A_VENCER', 'VENCIDO'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
                filtroStatus === s
                  ? 'bg-primary-600 border-primary-500 text-white'
                  : 'bg-surface-700 border-surface-600 text-surface-200 hover:text-white'
              }`}>
              {s === 'TODOS' ? 'Todos' : s === 'A_VENCER' ? 'A Vencer' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-6 text-xs text-surface-200 font-medium px-1">
        {[
          { color: '#22c55e', label: 'Vigência (Ativo)' },
          { color: '#f59e0b', label: 'Vigência (A Vencer)' },
          { color: '#ef4444', label: 'Vigência (Vencido)' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-4 h-2.5 rounded" style={{ backgroundColor: l.color }} />
            {l.label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rotate-45 bg-amber-400" />
          Iniciar processo (−4 meses)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-px h-4 bg-primary-400" />
          Hoje
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-4 overflow-x-auto min-h-[300px]">
        {loading ? (
          <div className="py-12"><LoadingSpinner text="Carregando pregões..." /></div>
        ) : error ? (
          <ErrorCard message={error} />
        ) : cards.length === 0 ? (
          <div className="py-12 text-center text-surface-400">Nenhum pregão encontrado.</div>
        ) : (
          <div style={{ minWidth: 200 + months.length * CELL_W }}>
            <div className="mb-6 mt-4">
              <MonthHeader months={months} />
            </div>
            <div className="space-y-1">
              {sortedCards.map(card => (
                <PregaoRow key={card.id} card={card} months={months} today={today} />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-surface-300 px-1">
        ◆ O marcador âmbar indica a data recomendada para iniciar o novo processo aquisitivo (4 meses antes do vencimento).
      </p>
    </div>
  )
}
