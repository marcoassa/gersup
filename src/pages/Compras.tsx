import { useMemo, useState, useEffect } from 'react'
import { ShoppingCart, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Search, Sparkles, Banknote, X, CheckCircle2, Share2 } from 'lucide-react'
import { useModificadoresStore } from '@/hooks/useModificadoresStore'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { getPiFromSi, getSisFromPlanoInterno, getSisDoMesmoPI } from '@/lib/ementario'
import { useQuery } from '@/hooks/useQuery'
import { getProdutos, getEstoque, getFornecimentos, getPregoes, getPedidosPendentes } from '@/lib/api'
import {
  agruparPorAno, mediaPonderada, safeDivide, calcCobertura, calcCriticidade,
  calcQuantidadeSugerida, isConsumoRecorrente, formatNumber, safeNum, calcStatusPregao,
  getSiTitulo, cn, formatCurrency,
} from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import type { ItemCompras, CriticidadeCompra, FiltrosCompras } from '@/types'

const CRIT_BADGE: Record<CriticidadeCompra, string> = {
  CRITICO: 'badge bg-red-900/50 text-red-300 border border-red-700/40',
  BAIXO: 'badge bg-orange-900/50 text-orange-300 border border-orange-700/40',
  NORMAL: 'badge bg-amber-900/50 text-amber-300 border border-amber-700/40',
  ALTO: 'badge bg-emerald-900/50 text-emerald-300 border border-emerald-700/40',
  SEM_HIST: 'badge bg-surface-700 text-surface-400 border border-surface-600',
}
const CRIT_LABEL: Record<CriticidadeCompra, string> = {
  CRITICO: 'Crítico', BAIXO: 'Baixo', NORMAL: 'Normal', ALTO: 'Alto', SEM_HIST: 'Sem histórico',
}
const CRIT_ORDER: CriticidadeCompra[] = ['CRITICO', 'BAIXO', 'NORMAL', 'ALTO', 'SEM_HIST']

type ColunaOrdenacao = 'criticidade' | 'estoque_atual' | 'pedidos_pendentes' | 'saldo_pregoes' | 'media_mensal' | 'cobertura_meses' | 'quantidade_sugerida'

interface ColHeader {
  label: string
  colKey?: ColunaOrdenacao
  align: 'left' | 'right' | 'center'
}

const COL_HEADERS: ColHeader[] = [
  { label: 'Componente MASTER', align: 'left' },
  { label: 'PN / MPN', align: 'left' },
  { label: 'Estoque', colKey: 'estoque_atual', align: 'right' },
  { label: 'Pedidos Pendentes', colKey: 'pedidos_pendentes', align: 'right' },
  { label: 'Saldo Pregões', colKey: 'saldo_pregoes', align: 'right' },
  { label: 'Custo Unit. Pregão', align: 'right' },
  { label: 'Média/Mês', colKey: 'media_mensal', align: 'right' },
  { label: 'Cobertura', colKey: 'cobertura_meses', align: 'right' },
  { label: 'Pregão Ativo', align: 'center' },
  { label: 'Qtd Sugerida', colKey: 'quantidade_sugerida', align: 'right' },
  { label: 'Criticidade', colKey: 'criticidade', align: 'left' },
  { label: '', align: 'center' }
]

const DEFAULT_FILTROS: FiltrosCompras = {
  min_anos_consumo: 3,
  media_mensal_min: 0.5,
  cobertura_alvo: 12,
  so_com_consumo_recorrente: false,
  pregao_ativo: 'TODOS',
  criticidade: 'TODAS',
  pagina: 1,
  por_pagina: 20,
}

export default function Compras() {
  const [filtros, setFiltros] = useState<FiltrosCompras>(DEFAULT_FILTROS)
  const [carrinho, setCarrinho] = useState<Map<string, { qtd: number; si: string | null; custo: number }>>(new Map())
  const [ordemCol, setOrdemCol] = useState<ColunaOrdenacao>('criticidade')
  const [ordemDirecao, setOrdemDirecao] = useState<'asc' | 'desc'>('asc')
  const [busca, setBusca] = useState('')
  const [alertaBudget, setAlertaBudget] = useState<{
    pi: string
    sisCobertas: string[]
    disponivel: number
    comprometido: number
    compartilhado: boolean
  } | null>(null)

  // Store global de modificadores
  const { modificadoresMap, fetched: modFetched, fetchModificadores } = useModificadoresStore()
  useEffect(() => { if (!modFetched) fetchModificadores() }, [modFetched, fetchModificadores])

  // Store de Notas de Crédito
  const { totalPorPI, fetched: ncFetched, fetchNotas } = useNotasCreditoStore()
  useEffect(() => { if (!ncFetched) fetchNotas() }, [ncFetched, fetchNotas])

  const setFiltro = <K extends keyof FiltrosCompras>(k: K, v: FiltrosCompras[K]) =>
    setFiltros(prev => {
      if (k === 'pagina') return { ...prev, pagina: v as number }
      return { ...prev, [k]: v, pagina: 1 }
    })

  const handleSort = (col: ColunaOrdenacao) => {
    if (ordemCol === col) {
      setOrdemDirecao(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setOrdemCol(col)
      setOrdemDirecao(col === 'criticidade' ? 'asc' : 'desc')
    }
  }

  const { data: produtos, loading: lP, error: eP, refetch: rP } = useQuery(getProdutos)
  const { data: estoques, loading: lE, error: eE, refetch: rE } = useQuery(getEstoque)
  const { data: fornData, loading: lF, error: eF, refetch: rF } = useQuery(getFornecimentos)
  const { data: pregoes, loading: lPG, error: ePG, refetch: rPG } = useQuery(getPregoes)
  const { data: pendentesData, loading: lPD, error: ePD, refetch: rPD } = useQuery(getPedidosPendentes)

  // 1. Pré-calcula os dados brutos de todos os itens master de forma ultrarrápida usando Mapas de índice em O(1)
  const baseItens = useMemo((): ItemCompras[] => {
    if (!produtos || !estoques || !fornData || !pregoes) return []

    // Mapa de família: cd_comp_master (ou o próprio cd_comp) -> lista de cd_comps equivalentes
    const masterToComps = new Map<string, string[]>()
    produtos.forEach(p => {
      const m = p.cd_comp_master || p.cd_comp
      if (!masterToComps.has(m)) masterToComps.set(m, [])
      masterToComps.get(m)!.push(p.cd_comp)
    })

    // Mapa de estoque CAVEX: cd_comp -> soma de estoque_total
    const estoqueCavex = new Map<string, number>()
    estoques.forEach(e => {
      if (e.ambiente === 'CAVEX') {
        estoqueCavex.set(e.cd_comp, (estoqueCavex.get(e.cd_comp) || 0) + safeNum(e.estoque_total))
      }
    })

    // Mapa de fornecimentos CAVEX: cd_comp -> array de Fornecimento
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

    // Mapa de saldo de pregões válidos: cd_comp_master -> soma de saldo_empenho
    // Mapa de custo unitário do pregão ativo: cd_comp_master -> valor_unitario do item mais recente
    const pregaoSaldo = new Map<string, number>()
    const pregaoCustoUnitario = new Map<string, number>()
    pregoes.forEach(p => {
      if (calcStatusPregao(p.data_vencimento) !== 'VENCIDO') {
        ;(p.itens ?? []).forEach(i => {
          if (i.cd_comp_master) {
            pregaoSaldo.set(i.cd_comp_master, (pregaoSaldo.get(i.cd_comp_master) || 0) + safeNum(i.saldo_empenho))
            // Guarda o custo unitário (sobrescreve para o mais recente encontrado)
            if (i.valor_unitario != null && safeNum(i.valor_unitario) > 0) {
              pregaoCustoUnitario.set(i.cd_comp_master, safeNum(i.valor_unitario))
            }
          }
        })
      }
    })

    // Mapa de pedidos pendentes: cd_comp_master -> quantidade
    const pendentesMap = new Map<string, number>()
    ;(pendentesData ?? []).forEach(p => {
      if (p.cd_comp_master) {
        pendentesMap.set(p.cd_comp_master, (pendentesMap.get(p.cd_comp_master) || 0) + safeNum(p.quantidade))
      }
    })

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
      const mediaPond = mediaPonderada(porAno)
      let mediaMensal = safeDivide(mediaPond, 12)
      const recorrente = isConsumoRecorrente(porAno, filtros.min_anos_consumo, filtros.media_mensal_min)

      const saldoPregoes = pregaoSaldo.get(master.cd_comp) || 0
      const pedidosPendentes = pendentesMap.get(master.cd_comp) || 0

      // Nova regra solicitada: Cobertura e criticidade calculadas com (estoque_atual + pedidos_pendentes), ignorando saldo no pregão
      let coberturaMeses = calcCobertura(estoqueAtual + pedidosPendentes, mediaMensal)
      let criticidade = calcCriticidade(coberturaMeses, porAno.filter(a => a.quantidade > 0).length > 0)
      let qtdSugerida = calcQuantidadeSugerida(mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes)

      // ── Aplicar Modificadores ────────────────────────────────────────────
      const mod = modificadoresMap.get(master.cd_comp)
      const campos_corrigidos: string[] = []
      let nomeFinal = master.nomenclatura

      // Se o item está marcado como ignorado, excluí-lo completamente da análise
      if (mod?.ignorar === true) return null

      if (mod) {
        if (mod.nomenclatura_override != null) {
          nomeFinal = mod.nomenclatura_override
          campos_corrigidos.push('nomenclatura')
        }
        if (mod.estoque_override != null) {
          estoqueAtual = mod.estoque_override
          coberturaMeses = calcCobertura(estoqueAtual + pedidosPendentes, mediaMensal)
          criticidade = calcCriticidade(coberturaMeses, porAno.filter(a => a.quantidade > 0).length > 0)
          qtdSugerida = calcQuantidadeSugerida(mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes)
          campos_corrigidos.push('estoque')
        }
        if (mod.media_anual_override != null) {
          mediaMensal = safeDivide(mod.media_anual_override, 12)
          coberturaMeses = calcCobertura(estoqueAtual + pedidosPendentes, mediaMensal)
          criticidade = calcCriticidade(coberturaMeses, porAno.filter(a => a.quantidade > 0).length > 0)
          qtdSugerida = calcQuantidadeSugerida(mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes)
          campos_corrigidos.push('media_anual')
        }
      }

      return {
        cd_comp_master: master.cd_comp,
        nomenclatura: nomeFinal,
        pn: master.pn,
        mpn: master.mpn,
        nd: master.nd,
        si: master.si,
        estoque_atual: estoqueAtual,
        pedidos_pendentes: pedidosPendentes,
        saldo_pregoes: saldoPregoes,
        custo_unitario_pregao: pregaoCustoUnitario.get(master.cd_comp) ?? null,
        media_mensal: mediaMensal,
        cobertura_meses: coberturaMeses,
        anos_com_consumo: porAno.filter(a => a.quantidade > 0).length,
        tem_pregao_ativo: saldoPregoes > 0,
        quantidade_sugerida: qtdSugerida,
        criticidade,
        campos_corrigidos,
        _recorrente: recorrente,
      } as ItemCompras & { _recorrente: boolean; campos_corrigidos: string[] }
    }).filter(Boolean) as (ItemCompras & { _recorrente: boolean; campos_corrigidos: string[] })[]
  }, [produtos, estoques, fornData, pregoes, pendentesData, filtros.cobertura_alvo, filtros.min_anos_consumo, filtros.media_mensal_min, modificadoresMap])

  // 2. Aplica ordenação e filtros instantaneamente em memória
  const itens = useMemo(() => {
    return baseItens
      .filter(i => {
        if (i.anos_com_consumo < filtros.min_anos_consumo) return false
        if (filtros.pregao_ativo === 'SIM' && !i.tem_pregao_ativo) return false
        if (filtros.pregao_ativo === 'NAO' && i.tem_pregao_ativo) return false
        if (filtros.criticidade && filtros.criticidade !== 'TODAS' && i.criticidade !== (filtros.criticidade as any)) return false
        // Busca textual
        if (busca.trim()) {
          const q = busca.toLowerCase()
          const matchCd = i.cd_comp_master.toLowerCase().includes(q)
          const matchNom = i.nomenclatura?.toLowerCase().includes(q)
          const matchPn = i.pn?.toLowerCase().includes(q)
          const matchMpn = i.mpn?.toLowerCase().includes(q)
          if (!matchCd && !matchNom && !matchPn && !matchMpn) return false
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (ordemCol === 'criticidade') {
          cmp = CRIT_ORDER.indexOf(a.criticidade) - CRIT_ORDER.indexOf(b.criticidade)
        } else {
          cmp = safeNum(a[ordemCol]) - safeNum(b[ordemCol])
        }
        return ordemDirecao === 'asc' ? cmp : -cmp
      })
  }, [baseItens, filtros.min_anos_consumo, filtros.pregao_ativo, filtros.criticidade, ordemCol, ordemDirecao, busca])

  const totalPags = Math.max(1, Math.ceil(itens.length / filtros.por_pagina))
  const paginados = itens.slice((filtros.pagina - 1) * filtros.por_pagina, filtros.pagina * filtros.por_pagina)

  const loading = lP || lE || lF || lPG || lPD
  const errMsg = eP || eE || eF || ePG || ePD

  // ── Painel de orçamento do carrinho por PI (pool compartilhado) ──────────────────────
  const carrinhoPiStats = useMemo(() => {
    if (carrinho.size === 0) return []

    // Agrupa gastos do carrinho por PI
    const gastoPI = new Map<string, number>()
    for (const [, { si, custo }] of carrinho) {
      if (!si) continue
      const pi = getPiFromSi(si.padStart(2, '0'))
      if (pi) gastoPI.set(pi, (gastoPI.get(pi) ?? 0) + custo)
    }

    return Array.from(gastoPI.entries()).map(([pi, comprometido]) => {
      const totalNC = totalPorPI[pi] ?? 0
      // getSisFromPlanoInterno já retorna os SIs do PI
      const sisCobertas = getSisFromPlanoInterno(pi)
      return {
        pi,
        comprometido,
        disponivel: totalNC,
        excedido: totalNC > 0 && comprometido > totalNC,
        semNC: totalNC === 0,
        sisCobertas,
        compartilhado: sisCobertas.length > 1,
      }
    }).sort((a, b) => a.pi.localeCompare(b.pi))
  }, [carrinho, totalPorPI])

  const carrinhoValorTotal = useMemo(() => {
    let total = 0
    for (const { custo } of carrinho.values()) total += custo
    return total
  }, [carrinho])

  const adicionarAoCarrinho = (item: ItemCompras) => {
    const siPad = (item.si ?? '').padStart(2, '0')
    const custo = item.quantidade_sugerida * (item.custo_unitario_pregao ?? 0)
    const pi = getPiFromSi(siPad)
    const budget = pi ? (totalPorPI[pi] ?? 0) : 0

    // Gasto atual do PI no carrinho (inclui todos os SIs do mesmo pool)
    let gastoAtualPI = 0
    for (const [, v] of carrinho) {
      if (!v.si) continue
      if (getPiFromSi(v.si.padStart(2, '0')) === pi) gastoAtualPI += v.custo
    }

    const novoGasto = gastoAtualPI + custo
    if (pi && budget > 0 && novoGasto > budget) {
      const sisCobertas = getSisDoMesmoPI(siPad)
      setAlertaBudget({
        pi,
        sisCobertas,
        disponivel: budget,
        comprometido: novoGasto,
        compartilhado: sisCobertas.length > 1,
      })
    }

    setCarrinho(prev => {
      const next = new Map(prev)
      next.set(item.cd_comp_master, { qtd: item.quantidade_sugerida, si: item.si, custo })
      return next
    })
  }

  const removerDoCarrinho = (cdComp: string) => {
    setCarrinho(prev => {
      const next = new Map(prev)
      next.delete(cdComp)
      return next
    })
  }

  if (loading) return <LoadingSpinner text="Calculando recomendações de compra..." />
  if (errMsg) return <ErrorCard message={errMsg} onRetry={() => { rP(); rE(); rF(); rPG(); rPD() }} />

  return (
    <div className="space-y-4">
      {/* Barra de busca */}
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

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="stat-label block mb-1">Mín. anos com consumo</label>
          <select className="input max-w-[140px]" value={filtros.min_anos_consumo} onChange={e => setFiltro('min_anos_consumo', Number(e.target.value) as 2|3|4)}>
            <option value={2}>2 anos</option><option value={3}>3 anos</option><option value={4}>4 anos</option>
          </select>
        </div>

        <div>
          <label className="stat-label block mb-1">Pregão Ativo</label>
          <select className="input max-w-[140px]" value={filtros.pregao_ativo ?? 'TODOS'} onChange={e => setFiltro('pregao_ativo', e.target.value as any)}>
            <option value="TODOS">Todos</option>
            <option value="SIM">Sim</option>
            <option value="NAO">Não</option>
          </select>
        </div>

        <div>
          <label className="stat-label block mb-1">Criticidade</label>
          <select className="input max-w-[140px]" value={filtros.criticidade ?? 'TODAS'} onChange={e => setFiltro('criticidade', e.target.value as any)}>
            <option value="TODAS">Todas</option>
            <option value="CRITICO">Crítico</option>
            <option value="ALTO">Alto</option>
            <option value="NORMAL">Normal</option>
            <option value="BAIXO">Baixo</option>
            <option value="SEM_HIST">Sem histórico</option>
          </select>
        </div>

        <div>
          <label className="stat-label block mb-1">Cobertura alvo</label>
          <select className="input max-w-[140px]" value={filtros.cobertura_alvo} onChange={e => setFiltro('cobertura_alvo', Number(e.target.value) as 6|12|18|24)}>
            <option value={6}>6 meses</option><option value={12}>12 meses</option>
            <option value={18}>18 meses</option><option value={24}>24 meses</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-surface-400">
          {itens.length} item(s) | Alvo: {filtros.cobertura_alvo} meses
        </div>
      </div>

      {carrinho.size > 0 && (
        <div className="space-y-3">
          {/* Barra de resumo do carrinho */}
          <div className="card p-3 flex items-center gap-3 border-primary-500/30 bg-primary-900/20">
            <ShoppingCart size={16} className="text-primary-400" />
            <span className="text-sm text-primary-300">{carrinho.size} item(s) no carrinho</span>
            <span className="text-xs text-surface-400">|</span>
            <span className="text-sm font-semibold text-surface-100">{formatCurrency(carrinhoValorTotal)}</span>
            <button className="btn-primary ml-auto !py-1.5" onClick={() => alert('Módulo de Pedidos em desenvolvimento')}>
              Criar Pedido de Empenho
            </button>
          </div>

          {/* Painel de orçamento por PI (pool compartilhado) */}
          {carrinhoPiStats.length > 0 && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={14} className="text-emerald-400" />
                <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider">Orçamento por Plano Interno (Notas de Crédito)</span>
              </div>
              {carrinhoPiStats.map(stat => {
                const pct = stat.disponivel > 0 ? Math.min(100, (stat.comprometido / stat.disponivel) * 100) : 0
                return (
                  <div key={stat.pi} className="space-y-1.5">
                    <div className="flex items-start justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn('font-mono font-semibold', stat.excedido ? 'text-red-300' : 'text-surface-200')}>
                            {stat.pi}
                          </span>
                          {stat.compartilhado && (
                            <span className="flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-900/20 border border-amber-700/30 px-1.5 py-0.5 rounded-full">
                              <Share2 size={8} /> pool compartilhado
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {stat.sisCobertas.map(si => {
                            const siPad = si.padStart(2, '0')
                            return (
                              <span key={si} className="text-[9px] text-surface-400">
                                SI {siPad} {getSiTitulo(siPad) ? `(${getSiTitulo(siPad)})` : ''}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {stat.semNC ? (
                          <span className="text-surface-500 text-[10px]">sem NC cadastrada</span>
                        ) : stat.excedido ? (
                          <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold">
                            <AlertTriangle size={10} />
                            {formatCurrency(stat.comprometido)} / {formatCurrency(stat.disponivel)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                            <CheckCircle2 size={10} />
                            {formatCurrency(stat.comprometido)} / {formatCurrency(stat.disponivel)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!stat.semNC && (
                      <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500', stat.excedido ? 'bg-red-500' : 'bg-emerald-500')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {COL_HEADERS.map(h => {
                const isSorted = ordemCol === h.colKey
                return (
                  <th key={h.label || 'acoes'}
                    className={`px-3 py-3 text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 whitespace-nowrap ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left'} ${h.colKey ? 'cursor-pointer select-none hover:text-primary-300 transition-colors' : ''}`}
                    onClick={() => h.colKey && handleSort(h.colKey)}
                  >
                    <div className={`flex items-center gap-1 ${h.align === 'right' ? 'justify-end' : h.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                      {h.label}
                      {h.colKey && (
                        <span className="text-surface-400 inline-flex items-center ml-0.5">
                          {isSorted ? (
                            ordemDirecao === 'asc' ? <ArrowUp size={12} className="text-primary-400" /> : <ArrowDown size={12} className="text-primary-400" />
                          ) : (
                            <ArrowUpDown size={12} className="opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {paginados.map(item => {
              const cobStr = item.cobertura_meses >= 9999 ? '∞' : `${formatNumber(item.cobertura_meses, 1)} m`
              const cobColor = item.criticidade === 'CRITICO' ? 'text-red-400' : item.criticidade === 'BAIXO' ? 'text-orange-400' : item.criticidade === 'NORMAL' ? 'text-amber-400' : 'text-emerald-400'
              return (
                <tr key={item.cd_comp_master} className="hover:bg-surface-700/30 transition-colors border-b border-surface-700/50 last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-mono text-xs text-primary-300">
                      {item.cd_comp_master}
                      {(item as any).campos_corrigidos?.length > 0 && <span className="ml-1 inline-flex"><Sparkles size={9} className="text-amber-400" /></span>}
                    </p>
                    <p className={cn('text-xs max-w-[200px] truncate', (item as any).campos_corrigidos?.includes('nomenclatura') ? 'text-amber-200' : 'text-surface-200')}
                      title={(item as any).campos_corrigidos?.includes('nomenclatura') ? 'DADOS CORRIGIDOS: ' + item.nomenclatura : item.nomenclatura}>
                      {item.nomenclatura}
                    </p>
                    <p className="text-[10px] text-surface-300">
                      ND {item.nd} / SI {item.si}
                      {item.si && <span className="text-surface-400 block truncate max-w-[200px]">{getSiTitulo(item.si)}</span>}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs text-surface-400"><p>{item.pn ?? '—'}</p><p className="text-surface-300">{item.mpn ?? '—'}</p></td>
                  <td className={cn('px-3 py-3 text-right text-sm font-semibold', (item as any).campos_corrigidos?.includes('estoque') ? 'text-amber-300' : 'text-surface-100')}
                    title={(item as any).campos_corrigidos?.includes('estoque') ? 'DADOS CORRIGIDOS' : undefined}>
                    {item.estoque_atual}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-semibold text-amber-300">{item.pedidos_pendentes}</td>
                  <td className="px-3 py-3 text-right text-sm text-sky-300">{item.saldo_pregoes}</td>
                  <td className="px-3 py-3 text-right text-xs font-semibold text-violet-300">
                    {item.custo_unitario_pregao != null
                      ? item.custo_unitario_pregao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : <span className="text-surface-500">—</span>}
                  </td>
                  <td className={cn('px-3 py-3 text-right text-xs', (item as any).campos_corrigidos?.includes('media_anual') ? 'text-amber-300 font-semibold' : 'text-surface-300')}
                    title={(item as any).campos_corrigidos?.includes('media_anual') ? 'DADOS CORRIGIDOS' : undefined}>
                    {formatNumber(item.media_mensal, 2)}
                  </td>
                  <td className={`px-3 py-3 text-right text-sm font-semibold ${cobColor}`}>{cobStr}</td>
                  <td className="px-3 py-3 text-center">
                    {item.tem_pregao_ativo
                      ? <span className="text-emerald-400 text-xs">✓ Sim</span>
                      : <span className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle size={10} />Não</span>
                    }
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-surface-50">
                    {item.quantidade_sugerida > 0 ? item.quantidade_sugerida.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-3"><span className={CRIT_BADGE[item.criticidade]}>{CRIT_LABEL[item.criticidade]}</span></td>
                  <td className="px-3 py-3">
                    {item.quantidade_sugerida > 0 && (
                      carrinho.has(item.cd_comp_master) ? (
                        <button
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-700/40 rounded px-2 py-1 hover:bg-red-900/20 transition-colors"
                          onClick={() => removerDoCarrinho(item.cd_comp_master)}
                        >
                          <X size={11} /> Remover
                        </button>
                      ) : (
                        <button className="btn-primary !py-1 !px-2 !text-xs"
                          onClick={() => adicionarAoCarrinho(item)}>
                          <ShoppingCart size={12} /> Add
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {paginados.length === 0 && <p className="text-center text-surface-400 text-sm py-10">Nenhum item nos filtros selecionados.</p>}
      </div>

      {totalPags > 1 && (
        <div className="flex items-center justify-between text-xs text-surface-400">
          <span>Página {filtros.pagina} de {totalPags} ({itens.length} itens)</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary !py-1 !px-3" onClick={() => setFiltro('pagina', Math.max(1, filtros.pagina - 1))} disabled={filtros.pagina === 1}>Ant.</button>
            <button className="btn-secondary !py-1 !px-3" onClick={() => setFiltro('pagina', Math.min(totalPags, filtros.pagina + 1))} disabled={filtros.pagina === totalPags}>Próx.</button>
          </div>
        </div>
      )}

      {/* Modal de alerta de orçamento excedido (por PI / pool) */}
      {alertaBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-800 border border-red-700/40 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-900/40 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-50">Orçamento do Pool Excedido</p>
                <p className="font-mono text-[10px] text-red-400">{alertaBudget.pi}</p>
              </div>
              <button className="text-surface-400 hover:text-surface-200" onClick={() => setAlertaBudget(null)}>
                <X size={16} />
              </button>
            </div>

            {alertaBudget.compartilhado && (
              <div className="mb-3 flex items-start gap-1.5 bg-amber-950/30 border border-amber-700/30 rounded-lg px-3 py-2">
                <Share2 size={11} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-300">
                  Este PI cobre um pool compartilhado entre{' '}
                  {alertaBudget.sisCobertas.map(s => `SI ${s.padStart(2, '0')}`).join(', ')}.
                  O saldo é consumido em conjunto por todos esses Subitens.
                </p>
              </div>
            )}

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Disponível (NC):</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(alertaBudget.disponivel)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Comprometido no carrinho:</span>
                <span className="text-red-400 font-semibold">{formatCurrency(alertaBudget.comprometido)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-surface-600/40 pt-2">
                <span className="text-surface-400">Excesso:</span>
                <span className="text-red-300 font-bold">{formatCurrency(alertaBudget.comprometido - alertaBudget.disponivel)}</span>
              </div>
            </div>
            <p className="text-xs text-surface-400 mb-4">
              O item foi adicionado ao carrinho. Verifique as Notas de Crédito disponíveis ou remova itens.
            </p>
            <button className="w-full btn-secondary" onClick={() => setAlertaBudget(null)}>Entendido</button>
          </div>
        </div>
      )}
    </div>
  )
}

