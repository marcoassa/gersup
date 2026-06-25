import { useMemo, useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Wallet, FileText, ChevronDown, ChevronRight, Search,
  Layers, SlidersHorizontal, TrendingUp, DollarSign,
  FlaskConical, Fish, Cpu, Package,
  Droplets, Zap, Camera,
  TestTube, HeartPulse, Crosshair, Wrench,
  Database, Building2, Shirt, Box, Download, Sparkles, Info, Banknote
} from 'lucide-react'
import { useModificadoresStore } from '@/hooks/useModificadoresStore'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { useQuery } from '@/hooks/useQuery'
import { getProdutos, getEstoque, getFornecimentos, getPregoes, getPedidosPendentes } from '@/lib/api'
import {
  agruparPorAno, mediaPonderada, safeDivide, calcCobertura, calcCriticidade,
  calcQuantidadeSugerida, formatNumber, formatCurrency, safeNum, calcStatusPregao,
  getSiTitulo, cn
} from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import type { CriticidadeCompra } from '@/types'

type AbaPlanejamento = 'financeiro' | 'pregoes'

interface FiltrosPlanejamento {
  min_anos_consumo: number
  cobertura_alvo: number
  pregao_ativo: 'CONSIDERAR' | 'DESCONSIDERAR'
  ambito_financeiro: 'TODOS' | 'COM_PREGAO'
  criticidade: Set<CriticidadeCompra>
}

const DEFAULT_FILTROS: FiltrosPlanejamento = {
  min_anos_consumo: 3,
  cobertura_alvo: 12,
  pregao_ativo: 'CONSIDERAR',
  ambito_financeiro: 'TODOS',
  criticidade: new Set<CriticidadeCompra>(),
}

// ─── Metadados de Criticidade ─────────────────────────────────────────────────
const CRIT_OPTIONS: { value: CriticidadeCompra; label: string; sub: string; color: string; dot: string }[] = [
  { value: 'CRITICO', label: 'Crítico',    sub: '≤ 2 meses',  color: 'text-red-400',    dot: 'bg-red-500' },
  { value: 'BAIXO',   label: 'Baixo',      sub: '≤ 6 meses',  color: 'text-amber-400',  dot: 'bg-amber-500' },
  { value: 'NORMAL',  label: 'Normal',     sub: '≤ 12 meses', color: 'text-yellow-300', dot: 'bg-yellow-400' },
  { value: 'ALTO',    label: 'Alto',       sub: '> 12 meses', color: 'text-emerald-400',dot: 'bg-emerald-500' },
  { value: 'SEM_HIST',label: 'Sem Hist.', sub: 'sem dados',  color: 'text-surface-400', dot: 'bg-surface-500' },
]

// Ícones representativos por Subitem (SI)
const S = ({ children, vb = '0 0 24 24' }: { children: React.ReactNode; vb?: string }) => (
  <svg viewBox={vb} width={28} height={28} fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

const ICONE_SI: Record<string, React.ReactNode> = {
  // SI 01 — Jipe
  '01': <S>
    <path d="M3 14h18v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4z"/>
    <path d="M3 14l2.5-5h13L21 14"/>
    <line x1="12" y1="9" x2="12" y2="18"/>
    <line x1="7" y1="14" x2="7" y2="18"/>
    <line x1="17" y1="14" x2="17" y2="18"/>
    <circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>
    <rect x="9" y="9" width="6" height="5" rx="0.5"/>
    <line x1="3" y1="16" x2="1" y2="16"/><line x1="21" y1="16" x2="23" y2="16"/>
  </S>,

  // SI 02 — Lata de óleo
  '02': <S>
    <path d="M5 8h9a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 011-1z"/>
    <path d="M15 11h3a1 1 0 011 1v2a1 1 0 01-1 1h-3"/>
    <path d="M19 12.5l2-1v2l-2-1"/>
    <line x1="4" y1="11" x2="4" y2="15"/>
    <path d="M7 8V6a2 2 0 012-2h3a2 2 0 012 2v2"/>
    <line x1="7" y1="13" x2="13" y2="13"/>
  </S>,

  // SI 04 — Cilindro de gás
  '04': <S>
    <rect x="7" y="7" width="10" height="13" rx="2"/>
    <path d="M9 7V5h6v2"/>
    <rect x="10" y="3" width="4" height="2" rx="1"/>
    <ellipse cx="12" cy="7" rx="5" ry="1.2"/>
    <rect x="6" y="20" width="12" height="2" rx="1"/>
    <line x1="10" y1="11" x2="14" y2="11"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </S>,

  // SI 11 — Química / Lab
  '11': <FlaskConical size={28} />,

  // SI 13 — Caça / Pesca
  '13': <Fish size={28} />,

  // SI 16 — Caneta e bloco de anotação
  '16': <S>
    <rect x="3" y="4" width="13" height="17" rx="1"/>
    <line x1="7" y1="2" x2="7" y2="6"/><line x1="10" y1="2" x2="10" y2="6"/><line x1="13" y1="2" x2="13" y2="6"/>
    <line x1="6" y1="9" x2="13" y2="9"/>
    <line x1="6" y1="12" x2="13" y2="12"/>
    <line x1="6" y1="15" x2="10" y2="15"/>
    <path d="M16 14l4-4 1.5 1.5-4 4z"/>
    <path d="M16 14l-1.5 3 3-1.5z"/>
    <line x1="19" y1="9" x2="20.5" y2="10.5"/>
  </S>,

  // SI 17 — Processamento de dados
  '17': <Cpu size={28} />,

  // SI 19 — Embalagens
  '19': <Box size={28} />,

  // SI 22 — Limpeza
  '22': <Droplets size={28} />,

  // SI 23 — Uniformes/Têxtil
  '23': <Shirt size={28} />,

  // SI 24 — Bens imóveis
  '24': <Building2 size={28} />,

  // SI 26 — Material elétrico/eletrônico
  '26': <Zap size={28} />,

  // SI 27 — Helicóptero com mira
  '27': <S>
    <ellipse cx="10" cy="13" rx="5" ry="3"/>
    <path d="M15 13l5 2"/>
    <line x1="20" y1="13" x2="20" y2="16"/>
    <line x1="3" y1="9" x2="17" y2="9"/>
    <circle cx="10" cy="9" r="0.8" fill="currentColor"/>
    <line x1="8" y1="16" x2="8" y2="18"/><line x1="12" y1="16" x2="12" y2="18"/>
    <line x1="6" y1="18" x2="10" y2="18"/><line x1="10" y1="18" x2="14" y2="18"/>
    <circle cx="20" cy="6" r="2.5"/>
    <line x1="20" y1="3" x2="20" y2="4.5"/><line x1="20" y1="7.5" x2="20" y2="9"/>
    <line x1="17" y1="6" x2="18.5" y2="6"/><line x1="21.5" y1="6" x2="23" y2="6"/>
    <circle cx="20" cy="6" r="0.5" fill="currentColor"/>
  </S>,

  // SI 28 — Abafador de ouvido (earmuff)
  '28': <S>
    <path d="M7 12Q7 5 12 5Q17 5 17 12" strokeWidth="1.8"/>
    <rect x="4" y="11" width="5" height="7" rx="2.5"/>
    <rect x="15" y="11" width="5" height="7" rx="2.5"/>
    <line x1="6.5" y1="13" x2="6.5" y2="16"/>
    <line x1="17.5" y1="13" x2="17.5" y2="16"/>
  </S>,

  // SI 29 — Áudio/Vídeo/Foto
  '29': <Camera size={28} />,

  // SI 32 — Lata de tinta (PAINT)
  '32': <S>
    <ellipse cx="12" cy="7" rx="7" ry="2"/>
    <path d="M5 7v11a1 1 0 001 1h12a1 1 0 001-1V7"/>
    <path d="M8 7Q8 3 12 3Q16 3 16 7"/>
    <rect x="7.5" y="11" width="9" height="5" rx="0.8"/>
    <line x1="9.5" y1="13" x2="14.5" y2="13"/>
    <line x1="9.5" y1="15" x2="13" y2="15"/>
  </S>,

  // SI 35 — Laboratorial
  '35': <TestTube size={28} />,

  // SI 36 — Hospitalar
  '36': <HeartPulse size={28} />,

  // SI 37 — Sobressalente de armamento
  '37': <Crosshair size={28} />,

  // SI 38 — Faixa de Safety (colete refletivo)
  '38': <S>
    <path d="M5 3h3l2 5h4l2-5h3l1 7H4L5 3z"/>
    <path d="M4 10h16v10H4z"/>
    <line x1="4" y1="13.5" x2="20" y2="13.5" strokeWidth="2"/>
    <line x1="4" y1="17" x2="20" y2="17" strokeWidth="2"/>
    <line x1="10" y1="10" x2="10" y2="20"/>
    <line x1="14" y1="10" x2="14" y2="20"/>
  </S>,

  // SI 39 — Manutenção de veículos
  '39': <Wrench size={28} />,

  // SI 42 — Parafusadeira
  '42': <S>
    <rect x="2" y="9" width="11" height="6" rx="2"/>
    <rect x="13" y="10" width="3" height="4" rx="0.5"/>
    <path d="M9 15v5a1 1 0 001 1h2a1 1 0 001-1v-5"/>
    <line x1="16" y1="12" x2="21" y2="12"/>
    <path d="M20 10l2 2-2 2"/>
    <line x1="7" y1="15" x2="7" y2="18"/>
  </S>,

  // SI 57 — Serviços de TI
  '57': <Database size={28} />,
}

interface ItemBasePlanejamento {
  cd_comp_master: string
  nomenclatura: string
  pn: string | null
  nd: string | null
  si: string | null
  estoque_atual: number
  pedidos_pendentes: number
  suprimento_disponivel: number
  saldo_pregoes: number
  media_mensal: number
  media_anual: number
  cobertura_meses: number
  criticidade: CriticidadeCompra
  anos_com_consumo: number
  tem_pregao_ativo: boolean
  preco_unitario: number
  origem_preco: 'PREGAO' | 'ESTIMADO' | 'NENHUM' | 'CORRIGIDO'
  quantidade_sugerida_reposicao: number
  custo_reposicao: number
  // Preserva a necessidade bruta antes de limitar pelo saldo do pregao (usado em COM_PREGAO)
  necessidade_total?: number
  // Campos com override aplicado
  campos_corrigidos: string[]
}

interface GrupoSiFinanceiro {
  si: string
  titulo: string
  itens: ItemBasePlanejamento[]
  custoTotal: number
  quantidadeMaster: number
}

interface ItemSimulacaoPregao extends ItemBasePlanejamento {
  qtd_edital: number
  custo_edital: number
}

interface GrupoSiPregoes {
  si: string
  titulo: string
  itens: ItemSimulacaoPregao[]
  custoTotal: number
  quantidadeMaster: number
}

// ─── Componente: Dropdown multi-seleção de Criticidade ───────────────────────────────
function CriticidadeMultiSelect({
  selected,
  onChange,
}: {
  selected: Set<CriticidadeCompra>
  onChange: (v: Set<CriticidadeCompra>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (val: CriticidadeCompra) => {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onChange(next)
  }

  const clearAll = () => onChange(new Set())

  // Label resumido para o botão trigger
  const triggerLabel = selected.size === 0
    ? 'Todas as Criticidades'
    : CRIT_OPTIONS
        .filter(o => selected.has(o.value))
        .map(o => o.label)
        .join(', ')

  return (
    <div className="relative" ref={ref}>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase mb-1">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-700/60 text-primary-200 text-[9px] font-bold shrink-0">3</span>
        Nível de Criticidade
      </label>

      {/* Botão trigger */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={cn(
          'input w-full text-xs py-2 flex items-center justify-between gap-2 text-left',
          selected.size > 0 && 'border-primary-500/60'
        )}
      >
        <span className="truncate text-surface-100" title={triggerLabel}>{triggerLabel}</span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-surface-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Painel dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[220px] bg-surface-800 border border-surface-600/70 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700/50">
            <span className="text-[10px] font-bold text-primary-300 uppercase tracking-wider">Filtrar por criticidade</span>
            {selected.size > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] text-surface-400 hover:text-surface-200 underline transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Opções */}
          <div className="py-1">
            {CRIT_OPTIONS.map(opt => {
              const checked = selected.has(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    checked ? 'bg-primary-900/40' : 'hover:bg-surface-700/50'
                  )}
                >
                  {/* Checkbox visual */}
                  <span className={cn(
                    'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                    checked
                      ? 'bg-primary-600 border-primary-500'
                      : 'border-surface-500 bg-surface-700'
                  )}>
                    {checked && (
                      <svg viewBox="0 0 10 8" width="10" height="8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>

                  {/* Dot colorido */}
                  <span className={cn('shrink-0 w-2 h-2 rounded-full', opt.dot)} />

                  {/* Texto */}
                  <span className="flex-1">
                    <span className={cn('text-xs font-semibold', opt.color)}>{opt.label}</span>
                    <span className="text-[10px] text-surface-500 ml-1.5">{opt.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Rodapé */}
          <div className="px-3 py-2 border-t border-surface-700/50 text-[10px] text-surface-500">
            {selected.size === 0 ? 'Exibindo todas' : `${selected.size} nível(is) selecionado(s)`}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Planejamento() {
  const [aba, setAba] = useState<AbaPlanejamento>('financeiro')
  const [filtros, setFiltros] = useState<FiltrosPlanejamento>(DEFAULT_FILTROS)
  const [busca, setBusca] = useState('')
  const [expandidosFin, setExpandidosFin] = useState<Set<string>>(new Set())
  const [expandidosPreg, setExpandidosPreg] = useState<Set<string>>(new Set())

  // Opção de simulação para a aba de Pregões
  const [abaterSuprimento, setAbaterSuprimento] = useState(true)

  // Store global de modificadores
  const { modificadoresMap, fetched: modFetched, fetchModificadores } = useModificadoresStore()
  useEffect(() => { if (!modFetched) fetchModificadores() }, [modFetched, fetchModificadores])

  // Store de Notas de Crédito
  const { getBudgetParaSi, fetched: ncFetched, fetchNotas } = useNotasCreditoStore()
  useEffect(() => { if (!ncFetched) fetchNotas() }, [ncFetched, fetchNotas])

  // Consultas em tempo real
  const { data: produtos, loading: lP, error: eP, refetch: rP } = useQuery(getProdutos)
  const { data: estoques, loading: lE, error: eE, refetch: rE } = useQuery(getEstoque)
  const { data: fornData, loading: lF, error: eF, refetch: rF } = useQuery(getFornecimentos)
  const { data: pregoes, loading: lPG, error: ePG, refetch: rPG } = useQuery(getPregoes)
  const { data: pendentesData, loading: lPD, error: ePD, refetch: rPD } = useQuery(getPedidosPendentes)

  const loading = lP || lE || lF || lPG || lPD
  const error = eP || eE || eF || ePG || ePD

  const refetchAll = () => {
    rP(); rE(); rF(); rPG(); rPD()
  }

  const setFiltro = <K extends keyof FiltrosPlanejamento>(k: K, v: FiltrosPlanejamento[K]) => {
    setFiltros(prev => ({ ...prev, [k]: v }))
  }

  // 1. Processamento bruto ultra-otimizado (O(1) lookups)
  const baseItens = useMemo((): ItemBasePlanejamento[] => {
    if (!produtos || !estoques || !fornData || !pregoes) return []

    // Mapeamento de equivalentes
    const masterToComps = new Map<string, string[]>()
    produtos.forEach(p => {
      const m = p.cd_comp_master || p.cd_comp
      if (!masterToComps.has(m)) masterToComps.set(m, [])
      masterToComps.get(m)!.push(p.cd_comp)
    })

    // Estoque CAVEX consolidado
    const estoqueCavex = new Map<string, number>()
    estoques.forEach(e => {
      if (e.ambiente === 'CAVEX') {
        estoqueCavex.set(e.cd_comp, (estoqueCavex.get(e.cd_comp) || 0) + safeNum(e.estoque_total))
      }
    })

    // Fornecimentos CAVEX
    const fornCavex = new Map<string, typeof fornData>()
    fornData.forEach(f => {
      if (f.ambiente === 'CAVEX') {
        const comp = f.cd_comp || f.cd_comp_master
        if (comp) {
          if (!fornCavex.has(comp)) fornCavex.set(comp, [])
          fornCavex.get(comp)!.push(f)
        }
      }
    })

    // Saldo e Preços de Pregões Ativos
    const pregaoSaldo = new Map<string, number>()
    const pregaoPreco = new Map<string, number>() // armazena o preco unitario do pregao ativo

    pregoes.forEach(p => {
      if (calcStatusPregao(p.data_vencimento) !== 'VENCIDO') {
        ;(p.itens ?? []).forEach(i => {
          if (i.cd_comp_master) {
            pregaoSaldo.set(i.cd_comp_master, (pregaoSaldo.get(i.cd_comp_master) || 0) + safeNum(i.saldo_empenho))
            // Se houver preço unitário válido, armazena
            if (safeNum(i.valor_unitario) > 0) {
              // Mantém o menor preço unitário ativo encontrado para conservadorismo ou coerência
              const current = pregaoPreco.get(i.cd_comp_master)
              if (!current || safeNum(i.valor_unitario) < current) {
                pregaoPreco.set(i.cd_comp_master, safeNum(i.valor_unitario))
              }
            }
          }
        })
      }
    })

    // Pedidos pendentes
    const pendentesMap = new Map<string, number>()
    ;(pendentesData ?? []).forEach(p => {
      if (p.cd_comp_master) {
        pendentesMap.set(p.cd_comp_master, (pendentesMap.get(p.cd_comp_master) || 0) + safeNum(p.quantidade))
      }
    })

    // Filtrar apenas produtos MASTER de mercado interno
    const masters = produtos.filter(p => p.pos_familia === 'MASTER' && p.mercado === 'INTERNO')

    return masters.map(master => {
      const comps = masterToComps.get(master.cd_comp) || [master.cd_comp]

      let estoqueAtual = 0
      comps.forEach(c => { estoqueAtual += estoqueCavex.get(c) || 0 })

      const fornList: typeof fornData = []
      comps.forEach(c => {
        const list = fornCavex.get(c)
        if (list) fornList.push(...list)
      })

      const porAno = agruparPorAno(fornList)
      let mediaPond = mediaPonderada(porAno)
      let mediaMensal = safeDivide(mediaPond, 12)
      // ── Regra de isolamento: anosComConsumoOriginal é calculado exclusivamente
      // dos dados reais de fornecimento e NUNCA é alterado por overrides.
      // O filtro "Mín. anos c/ consumo" sempre usa este valor original.
      const anosComConsumoOriginal = porAno.filter(a => a.quantidade > 0).length

      const saldoPregoes = pregaoSaldo.get(master.cd_comp) || 0
      const pedidosPendentes = pendentesMap.get(master.cd_comp) || 0
      let suprimento_disponivel = estoqueAtual + pedidosPendentes

      let coberturaMeses = calcCobertura(suprimento_disponivel, mediaMensal)
      let criticidade = calcCriticidade(coberturaMeses, anosComConsumoOriginal > 0)

      // Definição do Preço Unitário
      let preco_unitario = 0
      let origem_preco: ItemBasePlanejamento['origem_preco'] = 'NENHUM'

      const precoAtivoPregao = pregaoPreco.get(master.cd_comp)
      if (precoAtivoPregao && precoAtivoPregao > 0) {
        preco_unitario = precoAtivoPregao
        origem_preco = 'PREGAO'
      } else if (safeNum(master.preco_estimado) > 0) {
        preco_unitario = safeNum(master.preco_estimado)
        origem_preco = 'ESTIMADO'
      }

      let quantidade_sugerida_reposicao = calcQuantidadeSugerida(
        mediaMensal,
        filtros.cobertura_alvo,
        estoqueAtual,
        pedidosPendentes
      )
      let custo_reposicao = quantidade_sugerida_reposicao * preco_unitario

      // ── Aplicar Modificadores (overrides) ──────────────────────────────────
      const mod = modificadoresMap.get(master.cd_comp)
      const campos_corrigidos: string[] = []

      // Se o item está marcado como ignorado, excluí-lo completamente da análise
      if (mod?.ignorar === true) return null

      if (mod) {
        if (mod.nomenclatura_override != null) {
          // nomenclatura será substituída abaixo no return
          campos_corrigidos.push('nomenclatura')
        }
        if (mod.estoque_override != null) {
          estoqueAtual = mod.estoque_override
          suprimento_disponivel = estoqueAtual + pedidosPendentes
          coberturaMeses = calcCobertura(suprimento_disponivel, mediaMensal)
          // Regra: sempre usa anosComConsumoOriginal (dados brutos) na criticidade
          criticidade = calcCriticidade(coberturaMeses, anosComConsumoOriginal > 0)
          quantidade_sugerida_reposicao = calcQuantidadeSugerida(
            mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes
          )
          custo_reposicao = quantidade_sugerida_reposicao * preco_unitario
          campos_corrigidos.push('estoque')
        }
        if (mod.media_anual_override != null) {
          mediaMensal = safeDivide(mod.media_anual_override, 12)
          mediaPond = mod.media_anual_override
          coberturaMeses = calcCobertura(suprimento_disponivel, mediaMensal)
          // Regra de isolamento: o override de consumo NÃO altera a fonte de dados
          // usada pelo filtro de anos. anosComConsumoOriginal permanece dos dados brutos.
          // O override muda apenas mediaMensal/mediaPond para cálculo de reposição.
          criticidade = calcCriticidade(coberturaMeses, anosComConsumoOriginal > 0)
          quantidade_sugerida_reposicao = calcQuantidadeSugerida(
            mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes
          )
          custo_reposicao = quantidade_sugerida_reposicao * preco_unitario
          campos_corrigidos.push('media_anual')
        }
        if (mod.preco_unitario_override != null) {
          preco_unitario = mod.preco_unitario_override
          origem_preco = 'CORRIGIDO'
          custo_reposicao = quantidade_sugerida_reposicao * preco_unitario
          campos_corrigidos.push('preco_unitario')
        }
      }

      return {
        cd_comp_master: master.cd_comp,
        nomenclatura: mod?.nomenclatura_override ?? master.nomenclatura,
        pn: master.pn,
        nd: master.nd,
        si: master.si,
        estoque_atual: estoqueAtual,
        pedidos_pendentes: pedidosPendentes,
        suprimento_disponivel,
        saldo_pregoes: saldoPregoes,
        media_mensal: mediaMensal,
        media_anual: mediaPond,
        cobertura_meses: coberturaMeses,
        criticidade,
        // Sempre retorna o valor original dos dados brutos — nunca derivado de override
        anos_com_consumo: anosComConsumoOriginal,
        tem_pregao_ativo: saldoPregoes > 0,
        preco_unitario,
        origem_preco,
        quantidade_sugerida_reposicao,
        custo_reposicao,
        campos_corrigidos,
      }
    }).filter(Boolean) as ItemBasePlanejamento[]
  }, [produtos, estoques, fornData, pregoes, pendentesData, filtros.cobertura_alvo, modificadoresMap])

  // 2. Filtra os itens de acordo com o painel superior
  const itensFiltrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return baseItens.filter(item => {
      // Filtro de Anos Mínimos com Consumo
      if (item.anos_com_consumo < filtros.min_anos_consumo) return false

      // Filtro de Criticidade (multi-seleção — set vazio = todas)
      if (filtros.criticidade.size > 0 && !filtros.criticidade.has(item.criticidade)) return false

      // Busca textual
      if (q) {
        const matchCd = item.cd_comp_master.toLowerCase().includes(q)
        const matchNom = item.nomenclatura.toLowerCase().includes(q)
        const matchPn = item.pn?.toLowerCase().includes(q)
        if (!matchCd && !matchNom && !matchPn) return false
      }

      return true
    })
  }, [baseItens, filtros, busca])

  // 3. Agrupamento para a Aba Financeira
  // Hierarquia de filtros:
  // 1º anos_consumo (em itensFiltrados) → 2º ambito → 3º criticidade (em itensFiltrados) → 4º cobertura (apenas cálculo)
  // Quando criticidade está ativa, a cobertura alvo não exclui itens — ela só define a quantidade a comprar.
  const ambitoFin = filtros.ambito_financeiro
  const itensFinanceiros = useMemo(() => {
    // Se houver filtro de criticidade ativo, a criticidade é o portão de visibilidade
    // e a cobertura é apenas parâmetro de cálculo (itens com qtd=0 ainda aparecem).
    // Se não houver filtro de criticidade, o comportamento padrão é mostrar apenas
    // itens que efetivamente precisam de reposição.
    const hasCritFilter = filtros.criticidade.size > 0
    const base = hasCritFilter
      ? itensFiltrados
      : itensFiltrados.filter(item => item.quantidade_sugerida_reposicao > 0)

    if (ambitoFin === 'COM_PREGAO') {
      return base
        .filter(i => i.tem_pregao_ativo)
        .map(i => {
          // Necessidade bruta calculada sem limite de pregão
          const necessidadeBruta = i.quantidade_sugerida_reposicao
          // Limita ao saldo disponível no(s) pregão(s) ativo(s)
          const qtdLimitada = Math.min(necessidadeBruta, i.saldo_pregoes)
          return {
            ...i,
            quantidade_sugerida_reposicao: qtdLimitada,
            custo_reposicao: qtdLimitada * i.preco_unitario,
            necessidade_total: necessidadeBruta,  // preserva para exibição
          }
        })
        // Com filtro de criticidade ativo, mantém até mesmo itens com saldo zero do pregão.
        // Sem filtro, descarta se saldo do pregão for zero.
        .filter(i => hasCritFilter || i.quantidade_sugerida_reposicao > 0)
    }
    return base
  }, [itensFiltrados, ambitoFin, filtros.criticidade])

  const gruposFinanceiros = useMemo((): GrupoSiFinanceiro[] => {
    const map = new Map<string, ItemBasePlanejamento[]>()
    itensFinanceiros.forEach(item => {
      const siKey = item.si || '99'
      const arr = map.get(siKey) || []
      arr.push(item)
      map.set(siKey, arr)
    })

    return Array.from(map.entries())
      .map(([si, itens]) => {
        const titulo = getSiTitulo(si) || (si === '99' ? 'Subitem Não Cadastrado / Outros' : `Subitem ${si}`)
        const custoTotal = itens.reduce((acc, i) => acc + i.custo_reposicao, 0)
        return {
          si,
          titulo,
          itens: itens.sort((a, b) => b.custo_reposicao - a.custo_reposicao || a.cd_comp_master.localeCompare(b.cd_comp_master)),
          custoTotal,
          quantidadeMaster: itens.length
        }
      })
      .filter(g => filtros.criticidade.size > 0 ? g.itens.length > 0 : g.custoTotal > 0)
      .sort((a, b) => Number(a.si) - Number(b.si))
  }, [itensFinanceiros, filtros.criticidade.size])

  // Total Orçamentário Global da aba Financeira
  const totalOrcamentarioGlobal = useMemo(() => {
    return gruposFinanceiros.reduce((acc, g) => acc + g.custoTotal, 0)
  }, [gruposFinanceiros])

  // 4. Agrupamento e Simulação para a Aba de Pregões
  // Extraímos primitivos para garantir detecção de mudanças pelo React
  const coberturaAlvo = filtros.cobertura_alvo
  const pregaoAtivoOpcao = filtros.pregao_ativo

  const gruposPregoes = useMemo((): GrupoSiPregoes[] => {
    const map = new Map<string, ItemSimulacaoPregao[]>()

    itensFiltrados.forEach(item => {
      const siKey = item.si || '99'

      const necessidadeBruta = item.media_mensal * coberturaAlvo
      let abatimento = 0
      if (abaterSuprimento) abatimento += item.suprimento_disponivel
      if (pregaoAtivoOpcao === 'CONSIDERAR') abatimento += item.saldo_pregoes

      const qtd_edital = Math.max(0, Math.ceil(necessidadeBruta - abatimento))
      const custo_edital = qtd_edital * item.preco_unitario

      // Oculta itens sem necessidade de licitar — exceto quando há filtro de criticidade ativo
      // (nesse caso, a criticidade é o portão de visibilidade, não a cobertura)
      if (qtd_edital === 0 && filtros.criticidade.size === 0) return

      const itemSim: ItemSimulacaoPregao = { ...item, qtd_edital, custo_edital }
      const arr = map.get(siKey) || []
      arr.push(itemSim)
      map.set(siKey, arr)
    })

    return Array.from(map.entries())
      .map(([si, itens]) => {
        const titulo = getSiTitulo(si) || (si === '99' ? 'Subitem Não Cadastrado / Outros' : `Subitem ${si}`)
        const custoTotal = itens.reduce((acc, i) => acc + i.custo_edital, 0)
        return {
          si,
          titulo,
          itens: itens.sort((a, b) => b.custo_edital - a.custo_edital || a.cd_comp_master.localeCompare(b.cd_comp_master)),
          custoTotal,
          quantidadeMaster: itens.length,
        }
      })
      .filter(g => g.itens.length > 0) // remove grupos que ficaram sem itens
      .sort((a, b) => Number(a.si) - Number(b.si))
  }, [itensFiltrados, abaterSuprimento, pregaoAtivoOpcao, coberturaAlvo, filtros.criticidade])

  // Total Global da Simulação de Pregões
  const totalPregoesGlobal = useMemo(() => {
    return gruposPregoes.reduce((acc, g) => acc + g.custoTotal, 0)
  }, [gruposPregoes])

  const toggleExpandFin = (si: string) => {
    setExpandidosFin(prev => {
      const next = new Set(prev)
      next.has(si) ? next.delete(si) : next.add(si)
      return next
    })
  }

  const toggleExpandPreg = (si: string) => {
    setExpandidosPreg(prev => {
      const next = new Set(prev)
      next.has(si) ? next.delete(si) : next.add(si)
      return next
    })
  }

  // ─── Exportação Excel ────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const now = new Date()
    const dataHora = now.toLocaleString('pt-BR')

    // ── Helpers de formatação ──────────────────────────────────────────────────
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const num = (v: number, d = 2) => Number(v.toFixed(d))

    // ── Filtros aplicados (linha de contexto) ──────────────────────────────────
    const filtroTexto = [
      `Mín. anos c/ consumo: ${filtros.min_anos_consumo}`,
      `Cobertura alvo: ${filtros.cobertura_alvo} meses`,
      `Âmbito financeiro: ${filtros.ambito_financeiro === 'TODOS' ? 'Todos os itens' : 'Somente com Pregão'}`,
      `Saldos pregão: ${filtros.pregao_ativo === 'CONSIDERAR' ? 'Considerados' : 'Desconsiderados'}`,
      `Criticidade: ${filtros.criticidade.size === 0 ? 'Todas' : CRIT_OPTIONS.filter(o => filtros.criticidade.has(o.value)).map(o => o.label).join(', ')}`,
      busca ? `Busca: "${busca}"` : null,
    ].filter(Boolean).join(' | ')

    // ══════════════════════════════════════════════════════════════════════════
    // ABA 1 — PLANEJAMENTO FINANCEIRO
    // ══════════════════════════════════════════════════════════════════════════
    const rowsFin: any[][] = []

    // Cabeçalho de metadados
    rowsFin.push([`PLANEJAMENTO FINANCEIRO — Gerado em ${dataHora}`])
    rowsFin.push([filtroTexto])
    rowsFin.push([`Necessidade Orçamentária Total Estimada: ${brl(totalOrcamentarioGlobal)}`])
    rowsFin.push([`Total de itens: ${itensFinanceiros.length}`])
    rowsFin.push([]) // linha em branco

    // Cabeçalho de colunas
    const comPregaoExcel = filtros.ambito_financeiro === 'COM_PREGAO'
    rowsFin.push([
      'Subitem (SI)', 'Categoria',
      'Código MASTER', 'Nomenclatura', 'Part Number', 'ND',
      'Estoque Físico', 'Pedidos Pendentes', 'Suprimento Disponível', 'Saldo Pregão',
      'Média Mensal', 'Média Anual (Pond.)', 'Cobertura Atual (meses)',
      'Anos c/ Consumo', 'Criticidade',
      ...(comPregaoExcel ? ['Necessidade Total (s/ limite pregão)'] : []),
      'Qtd Sugerida Reposição', 'Preço Unitário', 'Origem Preço', 'Custo Reposição',
    ])

    for (const grupo of gruposFinanceiros) {
      for (const i of grupo.itens) {
        rowsFin.push([
          `SI ${grupo.si}`,
          grupo.titulo,
          i.cd_comp_master,
          i.nomenclatura,
          i.pn ?? '',
          i.nd ?? '',
          i.estoque_atual,
          i.pedidos_pendentes,
          i.suprimento_disponivel,
          i.saldo_pregoes,
          num(i.media_mensal),
          num(i.media_anual),
          num(i.cobertura_meses, 1),
          i.anos_com_consumo,
          i.criticidade,
          ...(comPregaoExcel ? [i.necessidade_total ?? i.quantidade_sugerida_reposicao] : []),
          i.quantidade_sugerida_reposicao,
          num(i.preco_unitario),
          i.origem_preco,
          num(i.custo_reposicao),
        ])
      }
      // Linha de subtotal do SI
      rowsFin.push([
        `Subtotal SI ${grupo.si}`, grupo.titulo,
        '', '', '', '',
        '', '', '', '',
        '', '', '',
        '', '',
        grupo.itens.reduce((s, x) => s + x.quantidade_sugerida_reposicao, 0),
        '', '',
        num(grupo.custoTotal),
      ])
      rowsFin.push([]) // separador
    }

    const wsFin = XLSX.utils.aoa_to_sheet(rowsFin)
    // Largura das colunas
    wsFin['!cols'] = [
      { wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 45 }, { wch: 20 }, { wch: 12 },
      { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
      { wch: 14 }, { wch: 18 }, { wch: 20 },
      { wch: 14 }, { wch: 14 },
      { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, wsFin, 'Planej. Financeiro')

    // ══════════════════════════════════════════════════════════════════════════
    // ABA 2 — PLANEJAMENTO DE PREGÕES
    // ══════════════════════════════════════════════════════════════════════════
    const rowsPreg: any[][] = []

    rowsPreg.push([`PLANEJAMENTO DE PREGÕES — Gerado em ${dataHora}`])
    rowsPreg.push([filtroTexto])
    rowsPreg.push([`Abatimento de estoque: ${abaterSuprimento ? 'Sim' : 'Não'}`])
    rowsPreg.push([`Custo Total Estimado do Edital: ${brl(totalPregoesGlobal)}`])
    rowsPreg.push([`Base: cobertura de ${filtros.cobertura_alvo} meses | ${itensFiltrados.length} itens`])
    rowsPreg.push([])

    rowsPreg.push([
      'Subitem (SI)', 'Categoria',
      'Código MASTER', 'Nomenclatura', 'Part Number', 'ND',
      'Média Anual (Pond.)', 'Média Mensal',
      'Estoque Físico', 'Pedidos Pendentes', 'Suprimento Disponível', 'Saldo Pregão',
      'Abatimento Total', 'Anos c/ Consumo', 'Criticidade',
      `Qtd Edital (${filtros.cobertura_alvo}m)`,
      'Preço Unitário', 'Origem Preço',
      `Valor Edital (${filtros.cobertura_alvo}m)`,
    ])

    for (const grupo of gruposPregoes) {
      for (const i of grupo.itens) {
        const abatimento = (abaterSuprimento ? i.suprimento_disponivel : 0)
          + (filtros.pregao_ativo === 'CONSIDERAR' ? i.saldo_pregoes : 0)
        rowsPreg.push([
          `SI ${grupo.si}`,
          grupo.titulo,
          i.cd_comp_master,
          i.nomenclatura,
          i.pn ?? '',
          i.nd ?? '',
          num(i.media_anual),
          num(i.media_mensal),
          i.estoque_atual,
          i.pedidos_pendentes,
          i.suprimento_disponivel,
          i.saldo_pregoes,
          abatimento,
          i.anos_com_consumo,
          i.criticidade,
          i.qtd_edital,
          num(i.preco_unitario),
          i.origem_preco,
          num(i.custo_edital),
        ])
      }
      rowsPreg.push([
        `Subtotal SI ${grupo.si}`, grupo.titulo,
        '', '', '', '',
        '', '',
        '', '', '', '',
        '', '', '',
        grupo.itens.reduce((s, x) => s + x.qtd_edital, 0),
        '', '',
        num(grupo.custoTotal),
      ])
      rowsPreg.push([])
    }

    const wsPreg = XLSX.utils.aoa_to_sheet(rowsPreg)
    wsPreg['!cols'] = [
      { wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 45 }, { wch: 20 }, { wch: 12 },
      { wch: 18 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
      { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsPreg, 'Planej. Pregões')

    // ══════════════════════════════════════════════════════════════════════════
    // ABA 3 — RESUMO CONSOLIDADO POR SUBITEM
    // ══════════════════════════════════════════════════════════════════════════
    const rowsRes: any[][] = []

    rowsRes.push([`RESUMO CONSOLIDADO — Gerado em ${dataHora}`])
    rowsRes.push([filtroTexto])
    rowsRes.push([])
    rowsRes.push([
      'Subitem (SI)', 'Categoria',
      'Itens Financeiro', 'Custo Financeiro (R$)',
      'Itens Pregão', 'Custo Pregão (R$)',
    ])

    // Unir todos os SIs presentes nos dois módulos
    const todosSis = new Set([
      ...gruposFinanceiros.map(g => g.si),
      ...gruposPregoes.map(g => g.si),
    ])
    const siOrdenados = [...todosSis].sort((a, b) => Number(a) - Number(b))

    for (const si of siOrdenados) {
      const gFin = gruposFinanceiros.find(g => g.si === si)
      const gPreg = gruposPregoes.find(g => g.si === si)
      const titulo = gFin?.titulo ?? gPreg?.titulo ?? `Subitem ${si}`
      rowsRes.push([
        `SI ${si}`,
        titulo,
        gFin?.quantidadeMaster ?? 0,
        num(gFin?.custoTotal ?? 0),
        gPreg?.quantidadeMaster ?? 0,
        num(gPreg?.custoTotal ?? 0),
      ])
    }

    rowsRes.push([])
    rowsRes.push([
      'TOTAL GERAL', '',
      gruposFinanceiros.reduce((s, g) => s + g.quantidadeMaster, 0),
      num(totalOrcamentarioGlobal),
      gruposPregoes.reduce((s, g) => s + g.quantidadeMaster, 0),
      num(totalPregoesGlobal),
    ])

    const wsRes = XLSX.utils.aoa_to_sheet(rowsRes)
    wsRes['!cols'] = [
      { wch: 12 }, { wch: 36 },
      { wch: 16 }, { wch: 24 },
      { wch: 14 }, { wch: 24 },
    ]
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumo Consolidado')

    // ── Download ───────────────────────────────────────────────────────────────
    const nomeFiltro = busca ? `_busca-${busca.replace(/\s+/g, '-').slice(0, 20)}` : ''
    const nomeArquivo = `GERSUP_Planejamento${nomeFiltro}_${now.toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, nomeArquivo)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Título e Abas Superiores */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-surface-700/60">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="text-primary-400" size={20} />
            <h1 className="text-lg font-bold text-surface-50">Planejamento Estratégico</h1>
          </div>
          <p className="text-xs text-surface-400 mt-0.5">
            Módulos integrados para previsão orçamentária e modelagem de Termos de Referência por Subitem (SI).
          </p>
        </div>

        {/* Abas + botão de exportação */}
        <div className="flex items-center gap-3 self-start lg:self-auto">
          <div className="flex items-center p-1 bg-surface-800/80 rounded-xl border border-surface-700/60">
            <button
              onClick={() => setAba('financeiro')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                aba === 'financeiro'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-950/50'
                  : 'text-surface-400 hover:text-surface-200'
              )}
            >
              <Wallet size={14} />
              <span>Planejamento Financeiro</span>
            </button>
            <button
              onClick={() => setAba('pregoes')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                aba === 'pregoes'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-950/50'
                  : 'text-surface-400 hover:text-surface-200'
              )}
            >
              <FileText size={14} />
              <span>Planejamento de Pregões</span>
            </button>
          </div>

          {/* Botão Baixar Excel */}
          <button
            onClick={exportarExcel}
            disabled={loading || (gruposFinanceiros.length === 0 && gruposPregoes.length === 0)}
            title="Baixar dados consolidados em Excel (.xlsx)"
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border',
              'bg-emerald-700/80 text-emerald-100 border-emerald-600/60',
              'hover:bg-emerald-600 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-950/40',
              'active:scale-95',
              'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-700/80'
            )}
          >
            <Download size={14} />
            <span>Baixar Excel</span>
          </button>
        </div>
      </div>

      {error && <ErrorCard message={error} onRetry={refetchAll} />}

      {/* Barra de busca padrão */}
      <div className="flex items-center gap-3 bg-surface-800 px-4 py-3 rounded-xl border border-surface-700/40">
        <Search size={16} className="text-surface-400 shrink-0" />
        <input
          className="input flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm text-surface-100 placeholder:text-surface-300"
          placeholder="Buscar por código MASTER, nomenclatura ou Part Number..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && (
          <button onClick={() => setBusca('')} className="text-surface-400 hover:text-surface-200 transition-colors text-xs">
            Limpar
          </button>
        )}
      </div>

      {/* Painel Central de Filtros */}
      <div className="card p-4 bg-surface-800/40 border-primary-500/10">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-surface-700/40">
          <div className="flex items-center gap-2 text-xs font-bold text-primary-300 uppercase tracking-wider">
            <SlidersHorizontal size={14} />
            <span>Filtros Globais de Análise</span>
          </div>
          <button
            onClick={() => setFiltros(DEFAULT_FILTROS)}
            className="text-[10px] text-surface-400 hover:text-surface-200 underline transition-colors"
          >
            Restaurar Padrões
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">

          {/* ① Mín. Anos c/ Consumo */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase mb-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-700/60 text-primary-200 text-[9px] font-bold shrink-0">1</span>
              Mín. Anos c/ Consumo
            </label>
            <select
              className="input w-full text-xs py-2"
              value={filtros.min_anos_consumo}
              onChange={e => setFiltro('min_anos_consumo', Number(e.target.value))}
            >
              <option value={0}>0 anos (Todos)</option>
              <option value={1}>1+ anos</option>
              <option value={2}>2+ anos</option>
              <option value={3}>3+ anos (Padrão)</option>
              <option value={4}>4+ anos</option>
            </select>
          </div>

          {/* ② Âmbito do Planejamento — contextual por aba */}
          {aba === 'financeiro' ? (
            <div className="relative">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase mb-1">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-700/60 text-primary-200 text-[9px] font-bold shrink-0">2</span>
                Âmbito do Planejamento
                {/* Tooltip de informação */}
                <span className="group/tip relative inline-flex">
                  <Info size={13} className="text-primary-400 hover:text-primary-200 cursor-help transition-colors drop-shadow-sm" />
                  {/* Painel flutuante */}
                  <div className={cn(
                    'pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50',
                    'w-72 rounded-xl border border-surface-600/80 bg-surface-800 shadow-2xl shadow-black/60',
                    'opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100',
                    'transition-all duration-150 origin-top'
                  )}>
                    {/* Seta apontando para cima (em direção ao ícone) */}
                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-surface-800 border-l border-t border-surface-600/80" />

                    <div className="p-3.5 space-y-3">
                      <p className="text-[10px] font-bold text-primary-300 uppercase tracking-wider">
                        Como funciona o Âmbito
                      </p>

                      {/* Opção 1 */}
                      <div className="rounded-lg bg-surface-700/50 border border-surface-600/40 p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                          <span className="text-[10px] font-bold text-surface-100">Todos os itens com demanda</span>
                        </div>
                        <p className="text-[10px] text-surface-400 leading-relaxed">
                          Exibe todos os itens que precisam de reposição, independente de existir pregão ativo.
                        </p>
                        <div className="mt-1 px-2 py-1 rounded bg-surface-900/60 font-mono text-[9px] text-surface-300">
                          Qtd = Média &times; Cobertura &minus; Estoque &minus; Pendentes
                        </div>
                      </div>

                      {/* Opção 2 */}
                      <div className="rounded-lg bg-emerald-950/30 border border-emerald-700/30 p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-[10px] font-bold text-emerald-200">Somente com Pregão Disponível</span>
                        </div>
                        <p className="text-[10px] text-surface-400 leading-relaxed">
                          Filtra apenas itens que possuem saldo em pregão vigente e limita a quantidade sugerida ao que o pregão permite comprar.
                        </p>
                        <div className="mt-1 space-y-0.5 px-2 py-1.5 rounded bg-surface-900/60 font-mono text-[9px] text-surface-300">
                          <div>Necessidade = Média &times; Cobertura &minus; Estoque</div>
                          <div className="text-emerald-400 font-bold">Qtd = min(Necessidade, Saldo Pregão)</div>
                        </div>
                        <p className="text-[9px] text-amber-400/80 leading-relaxed">
                          ⚠ Se a necessidade for maior que o saldo, a quantidade é limitada pelo pregão. O Excel mostra a necessidade original na coluna separada.
                        </p>
                      </div>
                    </div>
                  </div>
                </span>
              </label>
              <select
                className="input w-full text-xs py-2"
                value={filtros.ambito_financeiro}
                onChange={e => setFiltro('ambito_financeiro', e.target.value as any)}
              >
                <option value="TODOS">Todos os itens com demanda</option>
                <option value="COM_PREGAO">Somente com Pregão Disponível</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase mb-1">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-700/60 text-primary-200 text-[9px] font-bold shrink-0">2</span>
                Saldos em Pregões Vigentes
              </label>
              <select
                className="input w-full text-xs py-2"
                value={filtros.pregao_ativo}
                onChange={e => setFiltro('pregao_ativo', e.target.value as any)}
              >
                <option value="CONSIDERAR">Considerar no Abatimento</option>
                <option value="DESCONSIDERAR">Desconsiderar Saldos</option>
              </select>
            </div>
          )}

          {/* ③ Criticidade — multi-seleção (portão de visibilidade) */}
          <CriticidadeMultiSelect
            selected={filtros.criticidade}
            onChange={v => setFiltro('criticidade', v)}
          />

          {/* ④ Cobertura Alvo — apenas parâmetro de cálculo de quantidade */}
          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase mb-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-700/60 text-primary-200 text-[9px] font-bold shrink-0">4</span>
              Cobertura Alvo (Estoque)
            </label>
            <select
              className="input w-full text-xs py-2"
              value={filtros.cobertura_alvo}
              onChange={e => setFiltro('cobertura_alvo', Number(e.target.value))}
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses (Padrão)</option>
              <option value={18}>18 meses</option>
              <option value={24}>24 meses</option>
            </select>
          </div>

        </div>

      </div>

      {loading ? (
        <div className="py-24 card text-center">
          <LoadingSpinner text="Processando matriz de planejamento e precificação..." />
        </div>
      ) : aba === 'financeiro' ? (
        /* ==========================================
           ABA 1: PLANEJAMENTO FINANCEIRO
           ========================================== */
        <div className="space-y-6">
          {/* Banner de total orçamentário */}
          <div className="card p-6 bg-gradient-to-r from-primary-950/40 via-surface-800 to-surface-800 border-primary-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">
                Necessidade Orçamentária Total Estimada
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
                {formatCurrency(totalOrcamentarioGlobal)}
              </h2>
              <p className="text-[11px] text-surface-300 mt-1">
                Reposição até {filtros.cobertura_alvo} meses de cobertura
                {filtros.ambito_financeiro === 'COM_PREGAO'
                  ? ' · limitado ao saldo disponível nos pregões vigentes'
                  : ''}
                {' '}· {itensFinanceiros.length} itens
              </p>
            </div>
            <div className="flex items-center gap-3 bg-surface-900/60 px-4 py-3 rounded-xl border border-surface-700/50">
              <DollarSign className="text-emerald-400" size={24} />
              <div className="text-xs">
                <span className="text-surface-400 block font-medium">Prioridade de Valores</span>
                <span className="text-surface-100 font-semibold">1º Pregão Vigente · 2º Preço Estimado</span>
              </div>
            </div>
          </div>

          {gruposFinanceiros.length === 0 ? (
            <div className="card py-16 text-center">
              <p className="text-surface-400 text-sm font-medium">
                Nenhum Subitem demanda reposição com os filtros atuais.
              </p>
              <div className="mt-4 text-xs text-surface-500 space-y-1">
                {baseItens.length === 0 && (
                  <p>⚠ Nenhum produto MASTER retornado do banco — verifique a conexão ou os dados cadastrados.</p>
                )}
                {baseItens.length > 0 && itensFiltrados.length === 0 && (
                  <p>⚠ {baseItens.length} itens carregados, mas todos filtrados. Reduza o filtro de "Mín. Anos c/ Consumo" ou o "Nível de Criticidade".</p>
                )}
                {itensFiltrados.length > 0 && (
                  <p>ℹ {itensFiltrados.length} item(ns) passaram nos filtros, mas nenhum tem quantidade de reposição &gt; 0 ou preço cadastrado.</p>
                )}
              </div>
              {filtros.min_anos_consumo > 0 && (
                <button
                  onClick={() => setFiltro('min_anos_consumo', 0)}
                  className="mt-4 text-xs text-primary-400 hover:text-primary-300 underline transition-colors"
                >
                  Tentar com 0 anos mínimos de consumo
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {gruposFinanceiros.map(grupo => {
                const icone = ICONE_SI[grupo.si.padStart(2, '0')] ?? <Package size={28} />
                const open = expandidosFin.has(grupo.si)
                return (
                  <div key={grupo.si} className="card p-0 overflow-hidden border-surface-700/60 flex flex-col">
                    {/* Cabeçalho do card */}
                    <div className="p-5 bg-gradient-to-br from-surface-800 to-surface-900 flex items-start gap-4 border-b border-surface-700/50">
                      <div className="p-3 rounded-xl bg-primary-950/60 border border-primary-800/30 text-primary-400 shrink-0">
                        {icone}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-primary-400 uppercase tracking-widest block">SI {grupo.si}</span>
                        <h3 className="text-sm font-bold text-surface-50 leading-snug mt-0.5">{grupo.titulo}</h3>
                        <p className="text-[10px] text-surface-400 mt-1">{grupo.quantidadeMaster} item(ns) MASTER</p>
                      </div>
                    </div>

                    {/* Valor de reposição + Orçamento NC */}
                    <div className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-surface-400 uppercase font-semibold tracking-wider block">Investimento Estimado</span>
                          <span className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5 block">
                            {formatCurrency(grupo.custoTotal)}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleExpandFin(grupo.si)}
                          className="text-[9px] text-primary-400 hover:text-primary-300 flex items-center gap-1 font-semibold uppercase tracking-wider transition-colors"
                        >
                          {open ? 'Recolher' : 'Detalhar'}
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      </div>

                      {/* Linha de Orçamento NC */}
                      {(() => {
                        const budget = getBudgetParaSi(grupo.si)
                        const orcDisp = budget?.totalNC ?? 0
                        if (orcDisp === 0) return null
                        const excede = grupo.custoTotal > orcDisp
                        const pct = Math.min(100, (grupo.custoTotal / orcDisp) * 100)
                        return (
                          <div className={`rounded-lg px-3 py-2 border ${
                            excede
                              ? 'bg-red-950/30 border-red-700/30'
                              : 'bg-emerald-950/30 border-emerald-700/30'
                          }`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-surface-400">
                                <Banknote size={10} />
                                Orçamento Disponível (NC)
                                {budget?.compartilhado && (
                                  <span className="text-amber-400/80 ml-1" title={`Pool compartilhado com SIs: ${budget.sisCobertas.join(', ')}`}>
                                    (pool)
                                  </span>
                                )}
                              </span>
                              <span className={`text-xs font-bold ${
                                excede ? 'text-red-400' : 'text-emerald-400'
                              }`}>
                                {formatCurrency(orcDisp)}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-surface-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  excede ? 'bg-red-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {excede && (
                              <p className="text-[9px] text-red-400 mt-1">
                                ⚠ Excede o orçamento em {formatCurrency(grupo.custoTotal - orcDisp)}
                              </p>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Tabela expandida */}
                    {open && (
                      <div className="border-t border-surface-700/60 overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-800/80 text-surface-400 uppercase text-[9px] tracking-wider border-b border-surface-700/50">
                              <th className="py-2 px-3 font-semibold">MASTER</th>
                              <th className="py-2 px-3 font-semibold">Nome</th>
                              <th className="py-2 px-3 font-semibold text-right">Suprimento</th>
                              <th className="py-2 px-3 font-semibold text-right">Qtd Rep.</th>
                              <th className="py-2 px-3 font-semibold text-right">Preço</th>
                              <th className="py-2 px-3 font-semibold text-right">Custo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-700/40">
                            {grupo.itens.map(i => {
                               const C = i.campos_corrigidos
                               const cc = (campo: string) => C.includes(campo)
                               const derivado = (campos: string[]) => campos.some(c => C.includes(c))
                               const celCorrigido = 'bg-amber-950/30 border border-amber-600/30 rounded'
                               return (
                               <tr key={i.cd_comp_master} className="hover:bg-surface-800/50 transition-colors">
                                 <td className="py-2 px-3 font-mono font-bold text-primary-300 whitespace-nowrap text-[10px]">
                                   {i.cd_comp_master}
                                   {C.length > 0 && <span className="ml-1 inline-flex"><Sparkles size={9} className="text-amber-400" /></span>}
                                 </td>
                                 <td className={cn('py-2 px-3 max-w-[160px] truncate', cc('nomenclatura') && celCorrigido)}
                                   title={cc('nomenclatura') ? 'DADOS CORRIGIDOS: ' + i.nomenclatura : i.nomenclatura}>
                                   {i.nomenclatura}
                                 </td>
                                 <td className={cn('py-2 px-3 text-right whitespace-nowrap', cc('estoque') && celCorrigido)}
                                   title={cc('estoque') ? 'DADOS CORRIGIDOS' : undefined}>
                                   <span className="font-semibold text-surface-200">{i.suprimento_disponivel}</span>
                                   <span className="block text-[8px] text-surface-400">({i.estoque_atual} est + {i.pedidos_pendentes} pend)</span>
                                 </td>
                                 <td className={cn('py-2 px-3 text-right font-bold text-surface-50 font-mono', derivado(['media_anual','estoque']) && celCorrigido)}
                                   title={derivado(['media_anual','estoque']) ? 'DADOS CORRIGIDOS' : undefined}>
                                   {i.quantidade_sugerida_reposicao.toLocaleString('pt-BR')}
                                   {i.necessidade_total != null && i.necessidade_total > i.quantidade_sugerida_reposicao && (
                                     <span
                                       className="block text-[8px] text-amber-400 font-normal leading-tight"
                                       title={`Necessidade total: ${i.necessidade_total.toLocaleString('pt-BR')} un — limitado pelo saldo do pregão`}
                                     >
                                       limite pregão (need. {i.necessidade_total.toLocaleString('pt-BR')})
                                     </span>
                                   )}
                                 </td>
                                 <td className={cn('py-2 px-3 text-right whitespace-nowrap', cc('preco_unitario') && celCorrigido)}
                                   title={cc('preco_unitario') ? 'DADOS CORRIGIDOS' : undefined}>
                                   <span className="font-mono text-surface-200">{formatCurrency(i.preco_unitario)}</span>
                                   {i.origem_preco === 'PREGAO' && <span className="block text-[7px] font-bold text-emerald-400 uppercase">PREGÃO</span>}
                                   {i.origem_preco === 'ESTIMADO' && <span className="block text-[7px] font-bold text-amber-400 uppercase">CADASTRO</span>}
                                   {i.origem_preco === 'CORRIGIDO' && <span className="block text-[7px] font-bold text-amber-300 uppercase flex items-center gap-0.5"><Sparkles size={7}/>CORRIGIDO</span>}
                                   {i.origem_preco === 'NENHUM' && <span className="block text-[7px] text-surface-500 uppercase">SEM PREÇO</span>}
                                 </td>
                                 <td className={cn('py-2 px-3 text-right font-extrabold text-emerald-400 font-mono', derivado(['media_anual','estoque','preco_unitario']) && celCorrigido)}
                                   title={derivado(['media_anual','estoque','preco_unitario']) ? 'DADOS CORRIGIDOS' : undefined}>
                                   {formatCurrency(i.custo_reposicao)}
                                 </td>
                               </tr>
                               )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ==========================================
           ABA 2: PLANEJAMENTO DE PREGÕES
           ========================================== */
        <div className="space-y-4">
          {/* Controles de Simulação Superiores */}
          <div className="card p-5 bg-gradient-to-r from-surface-800 to-surface-900 border-surface-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-surface-50 flex items-center gap-2">
                <TrendingUp size={16} className="text-primary-400" />
                <span>Modelagem Comparativa de Termos de Referência</span>
              </h3>
              <p className="text-xs text-surface-400 mt-0.5 max-w-xl">
                Projete instantaneamente as quantidades e valores para editais de licitação cobrindo períodos de 12, 18 ou 24 meses.
              </p>
            </div>

            {/* Switch / Toggle Abater Suprimento */}
            <div className="flex items-center gap-3 bg-surface-800 p-2.5 rounded-xl border border-surface-700 shrink-0">
              <span className="text-xs font-medium text-surface-300 select-none cursor-pointer" onClick={() => setAbaterSuprimento(!abaterSuprimento)}>
                Abater Estoque + Pedidos Pendentes
              </span>
              <button
                type="button"
                onClick={() => setAbaterSuprimento(!abaterSuprimento)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  abaterSuprimento ? 'bg-primary-600' : 'bg-surface-600'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    abaterSuprimento ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Card único de total com cobertura do filtro */}
          <div className="card p-5 border-primary-500/20 bg-gradient-to-r from-primary-950/30 via-surface-800 to-surface-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary-400 uppercase tracking-wider">
                Custo Total Estimado do Edital
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
                {formatCurrency(totalPregoesGlobal)}
              </h2>
              <p className="text-[11px] text-surface-300 mt-1">
                Baseado em cobertura de <span className="font-bold text-primary-300">{filtros.cobertura_alvo} meses</span> para {itensFiltrados.length} itens filtrados.
              </p>
            </div>
            <div className="flex items-center gap-3 bg-surface-900/60 px-4 py-3 rounded-xl border border-surface-700/50 text-xs shrink-0">
              <TrendingUp className="text-emerald-400" size={20} />
              <div>
                <span className="text-surface-400 block font-medium">Base de cálculo</span>
                <span className="text-surface-100 font-semibold">
                  {abaterSuprimento ? 'Abatendo estoque físico' : 'Necessidade bruta'}
                  {filtros.pregao_ativo === 'CONSIDERAR' ? ' + saldo pregão' : ''}
                </span>
              </div>
            </div>
          </div>

          {gruposPregoes.length === 0 ? (
            <div className="card py-16 text-center">
              <p className="text-surface-400 text-sm font-medium">
                Nenhum produto listado para simulação de pregões sob os filtros vigentes.
              </p>
              <div className="mt-4 text-xs text-surface-500 space-y-1">
                {itensFiltrados.length === 0 && (
                  <p>⚠ Nenhum item passou pelos filtros. Reduza o filtro de "Mín. Anos c/ Consumo".</p>
                )}
                {itensFiltrados.length > 0 && (
                  <p>ℹ {itensFiltrados.length} item(ns) filtrados, mas nenhum tem necessidade de licitação acima de zero. Aumente a cobertura alvo ou desative o abatimento de estoque.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {gruposPregoes.map(grupo => {
                const open = expandidosPreg.has(grupo.si)
                return (
                  <div key={grupo.si} className="card p-0 overflow-hidden border-surface-700/60">
                    {/* Header do Grupo de Pregões */}
                    <div className="p-4 bg-surface-800/30 border-b border-surface-700/60 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                      <button
                        onClick={() => toggleExpandPreg(grupo.si)}
                        className="flex items-start gap-3 text-left min-w-0 flex-1 hover:opacity-80 transition-opacity"
                      >
                        <span className="mt-0.5 px-2 py-1 bg-primary-950 text-primary-300 border border-primary-800/50 rounded font-mono text-xs font-bold shrink-0">
                          SI {grupo.si}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-surface-50 truncate flex items-center gap-2">
                            <span>{grupo.titulo}</span>
                            <span className="text-[10px] font-normal text-surface-400 shrink-0">({grupo.quantidadeMaster} itens)</span>
                          </h3>
                          <p className="text-[11px] text-surface-400 mt-0.5">
                            Clique para {open ? 'recolher' : 'expandir'} os produtos MASTER e seus cálculos individuais
                          </p>
                        </div>
                        <div className="ml-auto p-1 text-surface-400 xl:hidden">
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </button>

                      {/* Total único do Subitem */}
                      <div className="flex items-center gap-4 pt-2 xl:pt-0 border-t xl:border-0 border-surface-700/40">
                        <div className="text-right">
                          <span className="text-[9px] text-emerald-400 block uppercase font-bold">Subtotal</span>
                          <span className="text-sm font-extrabold text-emerald-400 font-mono">
                            {formatCurrency(grupo.custoTotal)}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleExpandPreg(grupo.si)}
                          className="hidden xl:flex p-1 rounded-lg bg-surface-700/50 text-surface-400 hover:text-surface-100 transition-colors"
                        >
                          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Listagem detalhada dos Itens para Licitar */}
                    {open && (
                      <div className="bg-surface-900/40 overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-800 text-surface-400 uppercase text-[9px] tracking-wider border-b border-surface-700/60">
                              <th className="py-2.5 px-4 font-semibold">MASTER</th>
                              <th className="py-2.5 px-3 font-semibold">Nomenclatura</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Média/Ano</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Abatimento</th>
                              <th className="py-2.5 px-3 font-semibold text-right">Preço Base</th>
                              <th className="py-2.5 px-3 font-semibold text-right bg-emerald-950/20 border-l border-surface-700/50 text-emerald-400">
                                Qtd ({filtros.cobertura_alvo}m)
                              </th>
                              <th className="py-2.5 px-4 font-semibold text-right bg-emerald-950/20 text-emerald-400">
                                Valor ({filtros.cobertura_alvo}m)
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-surface-700/40">
                            {grupo.itens.map(i => {
                              const C = i.campos_corrigidos
                              const cc = (campo: string) => C.includes(campo)
                              const derivado = (campos: string[]) => campos.some(c => C.includes(c))
                              const cel = 'bg-amber-950/30 border border-amber-600/30 rounded'
                              return (
                              <tr key={i.cd_comp_master} className="hover:bg-surface-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-mono font-bold text-primary-300 whitespace-nowrap">
                                  {i.cd_comp_master}
                                  {C.length > 0 && <span className="ml-1 inline-flex"><Sparkles size={9} className="text-amber-400" /></span>}
                                </td>
                                <td className={cn('py-2.5 px-3 max-w-xs truncate', cc('nomenclatura') && cel)}
                                  title={cc('nomenclatura') ? 'DADOS CORRIGIDOS: ' + i.nomenclatura : i.nomenclatura}>
                                  {i.nomenclatura}
                                </td>
                                <td className={cn('py-2.5 px-3 text-right text-surface-300 font-mono', cc('media_anual') && cel)}
                                  title={cc('media_anual') ? 'DADOS CORRIGIDOS' : undefined}>
                                  {formatNumber(i.media_anual, 1)}
                                </td>
                                <td className={cn('py-2.5 px-3 text-right whitespace-nowrap font-mono', cc('estoque') && cel)}
                                  title={cc('estoque') ? 'DADOS CORRIGIDOS' : undefined}>
                                  <span className="text-surface-200 block font-semibold">
                                    {(abaterSuprimento ? i.suprimento_disponivel : 0) + (filtros.pregao_ativo === 'CONSIDERAR' ? i.saldo_pregoes : 0)}
                                  </span>
                                  <span className="text-[8px] text-surface-400 block">
                                    {abaterSuprimento ? `${i.suprimento_disponivel} est` : '0 est'}
                                    {filtros.pregao_ativo === 'CONSIDERAR' ? ` + ${i.saldo_pregoes} prg` : ''}
                                  </span>
                                </td>
                                <td className={cn('py-2.5 px-3 text-right whitespace-nowrap', cc('preco_unitario') && cel)}
                                  title={cc('preco_unitario') ? 'DADOS CORRIGIDOS' : undefined}>
                                  <span className="font-mono text-surface-200">{formatCurrency(i.preco_unitario)}</span>
                                  {i.origem_preco === 'PREGAO' && <span className="block mt-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-400">PREGÃO</span>}
                                  {i.origem_preco === 'ESTIMADO' && <span className="block mt-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-400">CADASTRO</span>}
                                  {i.origem_preco === 'CORRIGIDO' && <span className="block mt-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-0.5"><Sparkles size={7}/>CORRIGIDO</span>}
                                  {i.origem_preco === 'NENHUM' && <span className="block mt-0.5 text-[8px] text-surface-500 uppercase">SEM PREÇO</span>}
                                </td>
                                <td className={cn(
                                    'py-2.5 px-3 text-right font-bold text-emerald-400 font-mono border-l',
                                    derivado(['media_anual','estoque']) ? 'bg-amber-950/20 border-amber-600/20' : 'bg-emerald-950/10 border-surface-700/30'
                                  )}
                                  title={derivado(['media_anual','estoque']) ? 'DADOS CORRIGIDOS' : undefined}>
                                  {i.qtd_edital.toLocaleString('pt-BR')}
                                </td>
                                <td className={cn(
                                    'py-2.5 px-4 text-right font-extrabold text-emerald-400 font-mono',
                                    C.length > 0 ? 'bg-amber-950/20' : 'bg-emerald-950/10'
                                  )}
                                  title={C.length > 0 ? 'DADOS CORRIGIDOS' : undefined}>
                                  {formatCurrency(i.custo_edital)}
                                </td>
                              </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
