import { useMemo, useState, useEffect } from 'react'
import { ShoppingCart, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Search, Sparkles, Banknote, X, CheckCircle2, Share2, ClipboardList, Loader2, Plus, FileText, FileSpreadsheet } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useModificadoresStore } from '@/hooks/useModificadoresStore'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { getPiFromSi, getSisFromPlanoInterno } from '@/lib/ementario'
import { useQuery } from '@/hooks/useQuery'
import {
  getProdutos, getEstoque, getFornecimentos, getPregoes, getPedidosPendentes,
  criarPedidoCompra, deletePedidoCompra, getFornecedoresImpedidosMapSync, getFornecedoresImpedidosMap
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  agruparPorAno, mediaPonderada, safeDivide, calcCobertura, calcCriticidade,
  calcQuantidadeSugerida, isConsumoRecorrente, formatNumber, safeNum, calcStatusPregao,
  getSiTitulo, cn, formatCurrency, formatarObservacoesComNc, extrairNcDeObservacoes, extrairModeloMarcaRef
} from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import ItemDescTooltip, { ResumoTRTooltipContent } from '@/components/ui/ItemDescTooltip'
import ModalAdicionarAvulso from '@/components/ModalAdicionarAvulso'
import type { ItemCompras, CriticidadeCompra, FiltrosCompras, ItemCarrinhoEnriquecido, PregaoDisponivel, PedidoPendenteOrigem } from '@/types'


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

type ColunaOrdenacao = 'criticidade' | 'estoque_atual' | 'pedidos_pendentes' | 'saldo_pregoes' | 'media_mensal' | 'cobertura_meses' | 'quantidade_sugerida' | 'item_pregao'

interface ColHeader {
  label: string
  label2?: string
  colKey?: ColunaOrdenacao
  align: 'left' | 'right' | 'center'
}



const DEFAULT_FILTROS: FiltrosCompras = {
  min_anos_consumo: 3,
  media_mensal_min: 0.5,
  cobertura_alvo: 12,
  so_com_consumo_recorrente: false,
  pregao_ativo: 'TODOS',
  criticidade: 'TODAS',
  si: 'TODOS',
  status_pedidos_pregao: 'TODOS',
  pagina: 1,
  por_pagina: 20,
}

export default function Compras() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [filtros, setFiltros] = useState<FiltrosCompras>(DEFAULT_FILTROS)
  const [carrinho, setCarrinho] = useState<Map<string, ItemCarrinhoEnriquecido>>(new Map())
  const [rascunhoEditandoId, setRascunhoEditandoId] = useState<string | null>(null)
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
  const [modalPedido, setModalPedido] = useState(false)
  const [obsModal, setObsModal] = useState('')
  const [salvandoPedido, setSalvandoPedido] = useState(false)
  const [erroPedido, setErroPedido] = useState<string | null>(null)
  const [ncSelecionadaId, setNcSelecionadaId] = useState<string>('')
  const [qtdsCompra, setQtdsCompra] = useState<Map<string, number>>(new Map())
  const [modalAvulsoOpen, setModalAvulsoOpen] = useState(false)
  
  const [modoVisao, setModoVisao] = useState<'GERAL' | 'PREGAO'>('GERAL')
  const [pregaoSelecionadoId, setPregaoSelecionadoId] = useState<string | null>(null)
  const [pregaoSelecionadoPorMaster, setPregaoSelecionadoPorMaster] = useState<Record<string, string>>({})

  // Store global de modificadores
  const { modificadoresMap, fetched: modFetched, fetchModificadores } = useModificadoresStore()
  useEffect(() => { if (!modFetched) fetchModificadores() }, [modFetched, fetchModificadores])

  // Store de Notas de Crédito
  const { getBudgetEfetivoParaSi, getSisComNC, fetched: ncFetched, fetchNotas, notas, saldoPorNC } = useNotasCreditoStore()
  useEffect(() => { if (!ncFetched) fetchNotas() }, [ncFetched, fetchNotas])

  // Mapa de fornecedores impedidos
  const [impedidosMap, setImpedidosMap] = useState<Map<string, { impedido: boolean; motivo: string | null }>>(() => getFornecedoresImpedidosMapSync())
  useEffect(() => {
    getFornecedoresImpedidosMap().then(map => setImpedidosMap(map))

    const handleImpedidosUpdate = () => {
      setImpedidosMap(getFornecedoresImpedidosMapSync())
      getFornecedoresImpedidosMap().then(map => setImpedidosMap(map))
    }

    window.addEventListener('gersup_fornecedores_impedidos_change', handleImpedidosUpdate)
    window.addEventListener('focus', handleImpedidosUpdate)
    return () => {
      window.removeEventListener('gersup_fornecedores_impedidos_change', handleImpedidosUpdate)
      window.removeEventListener('focus', handleImpedidosUpdate)
    }
  }, [])

  // Recupera RASCUNHO do location state, se existir
  useEffect(() => {
    if (location.state?.editarRascunho) {
      const pedido = location.state.editarRascunho
      setRascunhoEditandoId(pedido.id)
      
      const novoCarrinho = new Map<string, ItemCarrinhoEnriquecido>()
      const pregoesSelecionados: Record<string, string> = {}
      
      pedido.itens?.forEach((i: any) => {
        if (i.cd_comp_master) {
          novoCarrinho.set(i.cd_comp_master, {
            qtd: i.quantidade,
            si: i.si,
            custo: i.valor_total,
            item_pregao_id: i.item_pregao_id,
            numero_item: i.numero_item,
            numero_pregao: i.numero_pregao,
            nomenclatura: i.nomenclatura,
            pn: i.pn,
            mpn: i.mpn,
            nd: i.nd,
            cm: i.cm,
            valor_unitario: i.valor_unitario
          })
          if (i.item_pregao_id) {
            pregoesSelecionados[i.cd_comp_master] = i.item_pregao_id
          }
        }
      })
      
      setCarrinho(novoCarrinho)
      if (Object.keys(pregoesSelecionados).length > 0) {
        setPregaoSelecionadoPorMaster(pregoesSelecionados)
      }
      if (pedido.observacoes) {
        const { numeroNc, textoLimpo } = extrairNcDeObservacoes(pedido.observacoes)
        setObsModal(textoLimpo)
        if (numeroNc) {
          setNcSelecionadaId(numeroNc)
        }
      }
      
      // Limpa o state para não recarregar em caso de navegação interna
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // SI sendo trocado no carrinho: cd_comp_master -> true (mostra seletor)
  const [trocandoSi, setTrocandoSi] = useState<string | null>(null)

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

    // Mapa de dados do item do Pregão Ativo: cd_comp_master -> lista de pregões disponíveis
    const pregaoItens = new Map<string, PregaoDisponivel[]>()
    pregoes.forEach(p => {
      if (calcStatusPregao(p.data_vencimento) !== 'VENCIDO') {
        ;(p.itens ?? []).forEach(i => {
          if (i.cd_comp_master) {
            const val = safeNum(i.valor_unitario)
            if (!pregaoItens.has(i.cd_comp_master)) {
              pregaoItens.set(i.cd_comp_master, [])
            }

            const cleanCnpj = (i.fornecedor_cnpj || '').replace(/\D/g, '')
            const impInfo = cleanCnpj ? impedidosMap.get(cleanCnpj) : null
            const isImpedido = !!impInfo?.impedido

            pregaoItens.get(i.cd_comp_master)!.push({
              id: i.id,
              numero_item: i.numero_item,
              numero_pregao: p.numero_pregao,
              descricao: i.descricao,
              descricao_tr: i.descricao_tr,
              valor_unitario: val,
              saldo_empenho: safeNum(i.saldo_empenho),
              fornecedor_nome: i.fornecedor_nome,
              fornecedor_cnpj: i.fornecedor_cnpj,
              impedido: isImpedido,
              motivo_impedimento: impInfo?.motivo || null,
            })
          }
        })
      }
    })

    // Mapa de pedidos pendentes: cd_comp_master -> quantidade e item_pregao_id -> quantidade
    const pendentesMap = new Map<string, number>()
    const pendentesPorItemPregaoMap = new Map<string, number>()
    const pendentesDetalhesPorMasterMap = new Map<string, PedidoPendenteOrigem[]>()
    const pendentesDetalhesPorItemPregaoMap = new Map<string, PedidoPendenteOrigem[]>()

    ;(pendentesData ?? []).forEach(p => {
      const qtd = safeNum(p.quantidade)
      const detalhe: PedidoPendenteOrigem = {
        pedido_id: p.pedido_id,
        pedido_numero: p.pedido_numero,
        quantidade: qtd,
        status: p.status,
      }
      if (p.cd_comp_master) {
        pendentesMap.set(p.cd_comp_master, (pendentesMap.get(p.cd_comp_master) || 0) + qtd)
        if (!pendentesDetalhesPorMasterMap.has(p.cd_comp_master)) {
          pendentesDetalhesPorMasterMap.set(p.cd_comp_master, [])
        }
        pendentesDetalhesPorMasterMap.get(p.cd_comp_master)!.push(detalhe)
      }
      if (p.item_pregao_id) {
        pendentesPorItemPregaoMap.set(p.item_pregao_id, (pendentesPorItemPregaoMap.get(p.item_pregao_id) || 0) + qtd)
        if (!pendentesDetalhesPorItemPregaoMap.has(p.item_pregao_id)) {
          pendentesDetalhesPorItemPregaoMap.set(p.item_pregao_id, [])
        }
        pendentesDetalhesPorItemPregaoMap.get(p.item_pregao_id)!.push(detalhe)
      }
    })

    const consolidarDetalhesPedidos = (detalhes: PedidoPendenteOrigem[]): PedidoPendenteOrigem[] => {
      const mapa = new Map<string, PedidoPendenteOrigem>()
      for (const d of detalhes) {
        const chave = d.pedido_id || String(d.pedido_numero)
        const existente = mapa.get(chave)
        if (existente) {
          existente.quantidade += d.quantidade
        } else {
          mapa.set(chave, { ...d })
        }
      }
      return Array.from(mapa.values()).sort((a, b) => a.pedido_numero - b.pedido_numero)
    }

    const calcMasterStats = (masterCdComp: string) => {
      const master = produtos.find(p => p.cd_comp === masterCdComp)
      if (!master) return null

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

      const pregoesDoMaster = pregaoItens.get(master.cd_comp) || []
      const pregoesValidos = pregoesDoMaster.filter(p => !p.impedido)
      const saldoPregoes = pregoesValidos.reduce((acc, p) => acc + p.saldo_empenho, 0)
      const temFornecedorImpedido = pregoesDoMaster.some(p => p.impedido)
      const primeiroImpedido = pregoesDoMaster.find(p => p.impedido)
      const principalPregao = pregoesValidos[0] || pregoesDoMaster[0]
      const pedidosPendentes = pendentesMap.get(master.cd_comp) || 0

      // Nova regra: Cobertura e criticidade calculadas com (estoque_atual + pedidos_pendentes)
      let coberturaMeses = calcCobertura(estoqueAtual + pedidosPendentes, mediaMensal)
      let criticidade = calcCriticidade(coberturaMeses, porAno.filter(a => a.quantidade > 0).length > 0)
      let qtdSugerida = calcQuantidadeSugerida(mediaMensal, filtros.cobertura_alvo, estoqueAtual, pedidosPendentes)

      // ── Aplicar Modificadores ─────────────────────────────────────────────
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

      const masterDetalhes = consolidarDetalhesPedidos(pendentesDetalhesPorMasterMap.get(master.cd_comp) || [])
      return {
        cd_comp_master: master.cd_comp,
        nomenclatura: nomeFinal,
        pn: master.pn,
        mpn: master.mpn,
        nd: master.nd,
        si: master.si,
        cm: (master as any).cm ?? null,
        estoque_atual: estoqueAtual,
        pedidos_pendentes: pedidosPendentes,
        pedidos_pendentes_detalhes: masterDetalhes,
        saldo_pregoes: saldoPregoes,
        custo_unitario_pregao: principalPregao?.valor_unitario ?? null,
        media_mensal: mediaMensal,
        cobertura_meses: coberturaMeses,
        anos_com_consumo: porAno.filter(a => a.quantidade > 0).length,
        tem_pregao_ativo: saldoPregoes > 0,
        tem_fornecedor_impedido: temFornecedorImpedido,
        motivo_impedimento: primeiroImpedido?.motivo_impedimento || null,
        quantidade_sugerida: qtdSugerida,
        criticidade,
        pregoes_disponiveis: pregoesDoMaster,
        item_pregao_id: principalPregao?.id ?? null,
        numero_item_pregao: principalPregao?.numero_item ?? null,
        numero_pregao_ativo: principalPregao?.numero_pregao ?? null,
        descricao_pregao_ativo: principalPregao?.descricao ?? null,
        campos_corrigidos,
        _recorrente: recorrente,
      } as ItemCompras & { _recorrente: boolean; campos_corrigidos: string[] }
    }

    if (modoVisao === 'PREGAO' && pregaoSelecionadoId) {
      const pregao = pregoes.find(p => p.id === pregaoSelecionadoId)
      if (!pregao || !pregao.itens) return []

      return pregao.itens.map(itemPregao => {
        const itensDoPregao = pendentesDetalhesPorItemPregaoMap.get(itemPregao.id) || []
        const itensDoMaster = itemPregao.cd_comp_master ? (pendentesDetalhesPorMasterMap.get(itemPregao.cd_comp_master) || []) : []
        const todosDetalhes = consolidarDetalhesPedidos([...itensDoPregao, ...itensDoMaster])
        const qtdPendenteItem = todosDetalhes.reduce((acc, d) => acc + d.quantidade, 0)
          || pendentesPorItemPregaoMap.get(itemPregao.id)
          || (itemPregao.cd_comp_master ? pendentesMap.get(itemPregao.cd_comp_master) : 0)
          || 0

        const cleanCnpj = (itemPregao.fornecedor_cnpj || '').replace(/\D/g, '')
        const impInfo = cleanCnpj ? impedidosMap.get(cleanCnpj) : null
        const isImpedido = !!impInfo?.impedido

        if (itemPregao.cd_comp_master) {
          const stats = calcMasterStats(itemPregao.cd_comp_master)
          if (stats) {
            return {
              ...stats,
              pedidos_pendentes: qtdPendenteItem || stats.pedidos_pendentes,
              pedidos_pendentes_detalhes: todosDetalhes.length > 0 ? todosDetalhes : stats.pedidos_pendentes_detalhes,
              saldo_pregoes: isImpedido ? 0 : itemPregao.saldo_empenho,
              quantidade_licitada: itemPregao.quantidade_licitada,
              quantidade_empenhada: itemPregao.quantidade_empenhada,
              item_pregao_id: itemPregao.id,
              numero_item_pregao: itemPregao.numero_item,
              numero_pregao_ativo: pregao.numero_pregao,
              descricao_pregao_ativo: itemPregao.descricao,
              custo_unitario_pregao: itemPregao.valor_unitario,
              tem_pregao_ativo: !isImpedido && itemPregao.saldo_empenho > 0,
              tem_fornecedor_impedido: isImpedido,
              motivo_impedimento: impInfo?.motivo || null,
              pregoes_disponiveis: [{
                id: itemPregao.id,
                numero_item: itemPregao.numero_item,
                numero_pregao: pregao.numero_pregao,
                descricao: itemPregao.descricao,
                descricao_tr: itemPregao.descricao_tr,
                valor_unitario: itemPregao.valor_unitario || 0,
                saldo_empenho: itemPregao.saldo_empenho || 0,
                fornecedor_nome: itemPregao.fornecedor_nome,
                fornecedor_cnpj: itemPregao.fornecedor_cnpj,
                impedido: isImpedido,
                motivo_impedimento: impInfo?.motivo || null,
              }],
            }
          }
        }
        
        const descTRouPregao = itemPregao.descricao_tr
          ? extrairModeloMarcaRef(itemPregao.descricao_tr)
          : (itemPregao.descricao ? 'SEM TERMO DE REFERENCIA' : `Item ${itemPregao.numero_item} do Pregão`)
        return {
          cd_comp_master: `UNMAPPED-${itemPregao.id}`,
          nomenclatura: descTRouPregao,
          pn: null,
          mpn: null,
          nd: null,
          si: null,
          cm: null,
          estoque_atual: 0,
          pedidos_pendentes: qtdPendenteItem,
          pedidos_pendentes_detalhes: todosDetalhes,
          saldo_pregoes: isImpedido ? 0 : itemPregao.saldo_empenho,
          quantidade_licitada: itemPregao.quantidade_licitada,
          quantidade_empenhada: itemPregao.quantidade_empenhada,
          custo_unitario_pregao: itemPregao.valor_unitario,
          media_mensal: 0,
          cobertura_meses: 0,
          anos_com_consumo: 0,
          tem_pregao_ativo: !isImpedido && itemPregao.saldo_empenho > 0,
          tem_fornecedor_impedido: isImpedido,
          motivo_impedimento: impInfo?.motivo || null,
          quantidade_sugerida: 0,
          criticidade: 'SEM_HIST' as const,
          item_pregao_id: itemPregao.id,
          numero_item_pregao: itemPregao.numero_item,
          numero_pregao_ativo: pregao.numero_pregao,
          descricao_pregao_ativo: descTRouPregao || itemPregao.descricao,
          pregoes_disponiveis: [{
            id: itemPregao.id,
            numero_item: itemPregao.numero_item,
            numero_pregao: pregao.numero_pregao,
            descricao: itemPregao.descricao,
            descricao_tr: itemPregao.descricao_tr,
            valor_unitario: itemPregao.valor_unitario || 0,
            saldo_empenho: itemPregao.saldo_empenho || 0,
            fornecedor_nome: itemPregao.fornecedor_nome,
            fornecedor_cnpj: itemPregao.fornecedor_cnpj,
            impedido: isImpedido,
            motivo_impedimento: impInfo?.motivo || null,
          }],
          campos_corrigidos: [],
          _recorrente: false,
        }
      }) as (ItemCompras & { _recorrente: boolean; campos_corrigidos: string[] })[]
    }

    const masters = produtos.filter(p => p.pos_familia === 'MASTER' && p.mercado === 'INTERNO')
    return masters.map(m => calcMasterStats(m.cd_comp)).filter(Boolean) as (ItemCompras & { _recorrente: boolean; campos_corrigidos: string[] })[]
  }, [produtos, estoques, fornData, pregoes, pendentesData, filtros.cobertura_alvo, filtros.min_anos_consumo, filtros.media_mensal_min, modificadoresMap, modoVisao, pregaoSelecionadoId, impedidosMap])

  // 2. Aplica ordenação e filtros instantaneamente em memória
  const itens = useMemo(() => {
    return baseItens
      .filter(i => {
        if (modoVisao === 'GERAL') {
          if (i.anos_com_consumo < filtros.min_anos_consumo) return false
          if (filtros.pregao_ativo === 'SIM' && !i.tem_pregao_ativo) return false
          if (filtros.pregao_ativo === 'IMPEDIDO' && !i.tem_fornecedor_impedido) return false
          if (filtros.pregao_ativo === 'NAO' && (i.tem_pregao_ativo || i.tem_fornecedor_impedido)) return false
        }
        if (modoVisao === 'PREGAO') {
          if (filtros.status_pedidos_pregao === 'COM_PEDIDOS' && (i.pedidos_pendentes || 0) <= 0) return false
          if (filtros.status_pedidos_pregao === 'COM_SALDO' && (i.saldo_pregoes || 0) <= 0) return false
          if (filtros.status_pedidos_pregao === 'SEM_SALDO' && (i.saldo_pregoes || 0) > 0) return false
        }
        if (filtros.criticidade && filtros.criticidade !== 'TODAS' && i.criticidade !== (filtros.criticidade as any)) return false
        if (filtros.si && filtros.si !== 'TODOS' && i.si !== filtros.si) return false
        // Busca textual
        if (busca.trim()) {
          const q = busca.toLowerCase().trim()
          const matchCd = i.cd_comp_master.toLowerCase().includes(q)
          const matchNom = i.nomenclatura?.toLowerCase().includes(q)
          const matchPn = i.pn?.toLowerCase().includes(q)
          const matchMpn = i.mpn?.toLowerCase().includes(q)
          const matchNumItem = String(i.numero_item_pregao ?? '') === q ||
            `item ${i.numero_item_pregao}`.includes(q) ||
            `#${i.numero_item_pregao}` === q
          const matchDescPregao = i.descricao_pregao_ativo?.toLowerCase().includes(q)
          const matchNumPregao = i.numero_pregao_ativo?.toLowerCase().includes(q)
          if (!matchCd && !matchNom && !matchPn && !matchMpn && !matchNumItem && !matchDescPregao && !matchNumPregao) return false
        }
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        if (ordemCol === 'item_pregao') {
          cmp = (a.numero_item_pregao ?? 0) - (b.numero_item_pregao ?? 0)
        } else if (ordemCol === 'criticidade') {
          cmp = CRIT_ORDER.indexOf(a.criticidade) - CRIT_ORDER.indexOf(b.criticidade)
        } else {
          cmp = safeNum(a[ordemCol]) - safeNum(b[ordemCol])
        }

        if (cmp === 0) {
          if (modoVisao === 'PREGAO') {
            return (a.numero_item_pregao ?? 0) - (b.numero_item_pregao ?? 0)
          }
          return (a.nomenclatura || '').localeCompare(b.nomenclatura || '')
        }

        return ordemDirecao === 'asc' ? cmp : -cmp
      })
  }, [baseItens, filtros.min_anos_consumo, filtros.pregao_ativo, filtros.criticidade, filtros.si, filtros.status_pedidos_pregao, ordemCol, ordemDirecao, busca, modoVisao])

  const sisUnicos = useMemo(() => {
    const sis = new Set<string>()
    baseItens.forEach(i => {
      if (i.si) sis.add(i.si)
    })
    return Array.from(sis).sort()
  }, [baseItens])

  const colHeaders: ColHeader[] = useMemo(() => [
    {
      label: modoVisao === 'PREGAO' ? 'Item /' : 'Componente',
      label2: modoVisao === 'PREGAO' ? 'Pregão' : 'MASTER',
      colKey: modoVisao === 'PREGAO' ? 'item_pregao' : undefined,
      align: 'left',
    },
    { label: 'PN / MPN', align: 'left' },
    { label: 'Estoque', colKey: 'estoque_atual', align: 'right' },
    {
      label: 'Pedidos',
      label2: modoVisao === 'PREGAO' ? 'Empenhados' : 'Pendentes',
      colKey: 'pedidos_pendentes',
      align: 'right'
    },
    {
      label: 'Saldo',
      label2: modoVisao === 'PREGAO' ? 'Disponível' : 'Pregões',
      colKey: 'saldo_pregoes',
      align: 'right'
    },
    { label: 'Custo', label2: 'Unit. Pregão', align: 'right' },
    { label: 'Média', label2: '/Mês', colKey: 'media_mensal', align: 'right' },
    { label: 'Cobertura', colKey: 'cobertura_meses', align: 'right' },
    { label: 'Pregão', label2: 'Ativo', align: 'center' },
    { label: 'Criticidade', colKey: 'criticidade', align: 'left' },
    { label: 'Qtd', label2: 'Sugerida', colKey: 'quantidade_sugerida', align: 'right' },
    { label: 'Qtd', label2: 'Compra', align: 'right' },
    { label: '', align: 'center' },
  ], [modoVisao])

  const totalPags = Math.max(1, Math.ceil(itens.length / filtros.por_pagina))
  const paginados = itens.slice((filtros.pagina - 1) * filtros.por_pagina, filtros.pagina * filtros.por_pagina)

  const loading = lP || lE || lF || lPG || lPD
  const errMsg = eP || eE || eF || ePG || ePD

  // 1. Painel de Orçamento do carrinho por SI
  const carrinhoSiStats = useMemo(() => {
    if (carrinho.size === 0) return []

    // Agrupa gastos do carrinho por SI
    const gastoSI = new Map<string, number>()
    for (const [, { si, custo }] of carrinho) {
      const siPad = si ? si.padStart(2, '0') : 'S/SI'
      gastoSI.set(siPad, (gastoSI.get(siPad) ?? 0) + custo)
    }

    return Array.from(gastoSI.entries()).map(([siPad, comprometido]) => {
      if (siPad === 'S/SI') {
        return {
          si: siPad,
          comprometido,
          disponivel: 0,
          excedido: true,
          semNC: true,
        }
      }
      const totalNC = getBudgetEfetivoParaSi(siPad)
      return {
        si: siPad,
        comprometido,
        disponivel: totalNC,
        excedido: totalNC > 0 && comprometido > totalNC,
        semNC: totalNC === 0,
      }
    }).sort((a, b) => a.si === 'S/SI' ? -1 : b.si === 'S/SI' ? 1 : a.si.localeCompare(b.si))
  }, [carrinho, getBudgetEfetivoParaSi])

  const carrinhoValorTotal = useMemo(() => {
    let total = 0
    for (const { custo } of carrinho.values()) total += custo
    return total
  }, [carrinho])

  const carrinhoBudgetTotal = useMemo(() => {
    let totalDisponivel = 0
    const poolsGenericosVistos = new Set<string>()

    for (const stat of carrinhoSiStats) {
      if (stat.si === 'S/SI' || stat.semNC) continue
      const info = useNotasCreditoStore.getState().getBudgetParaSi(stat.si)
      if (info?.siEspecifico) {
        totalDisponivel += stat.disponivel
      } else {
        const pi = info?.pi || getPiFromSi(stat.si) || stat.si
        if (!poolsGenericosVistos.has(pi)) {
          poolsGenericosVistos.add(pi)
          totalDisponivel += stat.disponivel
        }
      }
    }
    const restante = Math.max(0, totalDisponivel - carrinhoValorTotal)
    return { totalDisponivel, restante }
  }, [carrinhoSiStats, carrinhoValorTotal])

  const sisDoCarrinho = useMemo(() => {
    const sis = new Set<string>()
    for (const [, item] of carrinho) {
      if (item.si && item.si.trim()) {
        sis.add(item.si.trim().padStart(2, '0'))
      }
    }
    return Array.from(sis)
  }, [carrinho])

  const ncsDisponiveisParaCarrinho = useMemo(() => {
    if (sisDoCarrinho.length === 0) return []
    const sisSet = new Set(sisDoCarrinho)
    const pisSet = new Set(sisDoCarrinho.map(si => getPiFromSi(si)).filter(Boolean))

    return notas.filter(nc => {
      if (nc.status === 'ENCERRADA') return false
      const ncSi = nc.si ? nc.si.trim().padStart(2, '0') : null
      if (ncSi && sisSet.has(ncSi)) return true
      if (!ncSi && nc.plano_interno && pisSet.has(nc.plano_interno.trim())) return true
      return false
    })
  }, [notas, sisDoCarrinho])

  useEffect(() => {
    if (ncsDisponiveisParaCarrinho.length === 1) {
      setNcSelecionadaId(ncsDisponiveisParaCarrinho[0].numero_nc || ncsDisponiveisParaCarrinho[0].id)
    } else if (ncsDisponiveisParaCarrinho.length === 0) {
      setNcSelecionadaId('')
    } else {
      setNcSelecionadaId(prev => {
        const valida = ncsDisponiveisParaCarrinho.some(n => (n.numero_nc || n.id) === prev || n.id === prev)
        return valida ? prev : ''
      })
    }
  }, [ncsDisponiveisParaCarrinho])

  const adicionarAoCarrinho = (item: ItemCompras, forceQtd?: number, forcePregaoId?: string) => {
    const siPad = (item.si ?? '').padStart(2, '0')
    const pregaoSelecionadoId = forcePregaoId ?? pregaoSelecionadoPorMaster[item.cd_comp_master] ?? item.pregoes_disponiveis?.[0]?.id
    const pregaoAtivo = item.pregoes_disponiveis?.find(p => p.id === pregaoSelecionadoId) ?? item.pregoes_disponiveis?.[0]

    if (pregaoAtivo?.impedido) {
      alert(`Este item não pode ser adicionado ao carrinho pois o fornecedor está IMPEDIDO DE EMPENHO.\n\nMotivo: ${pregaoAtivo.motivo_impedimento || 'Restrição cadastrada no sistema'}`)
      return
    }

    // Se temos um pregaoAtivo na lista de disponíveis, os dados DEVEM vir estritamente dele.
    // Se não temos (ex: item avulso que não possui array de disponíveis mapeado igual), usamos os dados do mockItem.
    const resolved_id = pregaoAtivo ? pregaoAtivo.id : item.item_pregao_id;
    const resolved_num_item = pregaoAtivo ? pregaoAtivo.numero_item : item.numero_item_pregao;
    const resolved_num_pregao = pregaoAtivo ? pregaoAtivo.numero_pregao : item.numero_pregao_ativo;
    const resolved_valor = pregaoAtivo ? (pregaoAtivo.valor_unitario ?? 0) : (item.custo_unitario_pregao ?? 0);

    const valorUnit = resolved_valor
    const qtd = forceQtd ?? Math.max(1, qtdsCompra.get(item.cd_comp_master) ?? item.quantidade_sugerida)
    const custo = qtd * valorUnit
    const budget = getBudgetEfetivoParaSi(siPad)

    let gastoAtualSI = 0
    for (const [, v] of carrinho) {
      if (!v.si) continue
      if (v.si.padStart(2, '0') === siPad) gastoAtualSI += v.custo
    }

    const novoGasto = gastoAtualSI + custo
    if (budget > 0 && novoGasto > budget) {
      const pi = getPiFromSi(siPad)
      const sisCobertas = getSisFromPlanoInterno(pi ?? '')
      setAlertaBudget({ pi: pi ?? siPad, sisCobertas, disponivel: budget, comprometido: novoGasto, compartilhado: false })
    }

    setCarrinho(prev => {
      const next = new Map(prev)
      next.set(item.cd_comp_master, {
        qtd,
        si: item.si,
        custo,
        item_pregao_id: resolved_id,
        numero_item: resolved_num_item,
        numero_pregao: resolved_num_pregao,
        nomenclatura: item.nomenclatura,
        pn: item.pn,
        mpn: item.mpn,
        nd: item.nd,
        cm: item.cm,
        valor_unitario: resolved_valor,
      })
      return next
    })
  }

  const trocarSiNoCarrinho = (cdComp: string, novoSi: string) => {
    setCarrinho(prev => {
      const next = new Map(prev)
      const item = next.get(cdComp)
      if (item) next.set(cdComp, { ...item, si: novoSi })
      return next
    })
    setTrocandoSi(null)
  }

  const removerDoCarrinho = (cdComp: string) => {
    setCarrinho(prev => {
      const next = new Map(prev)
      next.delete(cdComp)
      return next
    })
  }

  const exportarXLSX = () => {
    const dados = itens.map(item => ({
      'Componente MASTER': item.cd_comp_master.startsWith('UNMAPPED-') ? 'Sem Código MASTER' : item.cd_comp_master,
      'Nomenclatura': item.nomenclatura,
      'PN': item.pn || '',
      'MPN': item.mpn || '',
      'ND': item.nd || '',
      'SI': item.si || '',
      'Estoque Atual': item.estoque_atual,
      'Pedidos Pendentes': item.pedidos_pendentes,
      'Saldo Pregões': item.saldo_pregoes,
      'Custo Unit. Pregão': item.custo_unitario_pregao ?? '',
      'Média /Mês': Number(item.media_mensal.toFixed(2)),
      'Cobertura (Meses)': item.cobertura_meses >= 9999 ? '∞' : Number(item.cobertura_meses.toFixed(1)),
      'Pregão Ativo': item.tem_pregao_ativo ? 'Sim' : 'Não',
      'Criticidade': CRIT_LABEL[item.criticidade] || item.criticidade,
      'Qtd Sugerida': item.quantidade_sugerida
    }))

    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, 'Relatorio_Compras.xlsx')
  }

  const exportarPDF = () => {
    const doc = new jsPDF('landscape')
    
    const colunas = [
      'MASTER', 'Nomenclatura', 'Estoque', 'Pendentes', 'Saldo Pregão', 'Custo', 'Média/Mês', 'Cobertura', 'Criticidade', 'Qtd'
    ]
    
    const linhas = itens.map(item => [
      item.cd_comp_master.startsWith('UNMAPPED-') ? 'Sem Código MASTER' : item.cd_comp_master,
      item.nomenclatura ? item.nomenclatura.substring(0, 30) : '',
      item.estoque_atual,
      item.pedidos_pendentes,
      item.saldo_pregoes,
      item.custo_unitario_pregao != null ? item.custo_unitario_pregao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-',
      formatNumber(item.media_mensal, 2),
      item.cobertura_meses >= 9999 ? '∞' : formatNumber(item.cobertura_meses, 1),
      CRIT_LABEL[item.criticidade] || item.criticidade,
      item.quantidade_sugerida
    ])

    doc.text('Relatório de Compras (Filtrado)', 14, 15)
    
    autoTable(doc, {
      head: [colunas],
      body: linhas,
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    })

    doc.save('Relatorio_Compras.pdf')
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
          placeholder={modoVisao === 'PREGAO' ? "Buscar por Nº do item, código MASTER, descrição ou Part Number..." : "Buscar por código MASTER, nomenclatura ou Part Number..."}
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && (
          <button onClick={() => setBusca('')} className="text-surface-400 hover:text-surface-200 transition-colors text-xs">
            Limpar
          </button>
        )}
      </div>

      {/* Toggle Visão */}
      <div className="flex bg-surface-800 p-1 rounded-lg border border-surface-700/50 w-fit">
        <button
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-colors", modoVisao === 'GERAL' ? "bg-primary-600 text-white shadow-sm" : "text-surface-400 hover:text-surface-200")}
          onClick={() => {
            setModoVisao('GERAL')
            setOrdemCol('criticidade')
            setOrdemDirecao('asc')
          }}
        >
          Visão Geral
        </button>
        <button
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-colors", modoVisao === 'PREGAO' ? "bg-primary-600 text-white shadow-sm" : "text-surface-400 hover:text-surface-200")}
          onClick={() => {
            setModoVisao('PREGAO')
            setOrdemCol('item_pregao')
            setOrdemDirecao('asc')
            setFiltro('por_pagina', 50)
          }}
        >
          Por Pregão
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        {modoVisao === 'GERAL' && (
          <>
            <div>
              <label className="stat-label block mb-1">Mín. anos com consumo</label>
              <select className="input max-w-[140px]" value={filtros.min_anos_consumo} onChange={e => setFiltro('min_anos_consumo', Number(e.target.value) as 0|2|3|4)}>
                <option value={0}>0 anos</option>
                <option value={2}>2 anos</option>
                <option value={3}>3 anos</option>
                <option value={4}>4 anos</option>
              </select>
            </div>

            <div>
              <label className="stat-label block mb-1">Pregão Ativo</label>
              <select className="input max-w-[140px]" value={filtros.pregao_ativo ?? 'TODOS'} onChange={e => setFiltro('pregao_ativo', e.target.value as any)}>
                <option value="TODOS">Todos</option>
                <option value="SIM">Sim</option>
                <option value="IMPEDIDO">Impedido</option>
                <option value="NAO">Não</option>
              </select>
            </div>
          </>
        )}

        {modoVisao === 'PREGAO' && (
          <>
            <div className="flex-1 min-w-[200px] max-w-[450px]">
              <label className="stat-label block mb-1">Selecione o Pregão</label>
              <select
                className="input w-full"
                value={pregaoSelecionadoId ?? ''}
                onChange={e => setPregaoSelecionadoId(e.target.value)}
              >
                <option value="">Selecione um pregão...</option>
                {pregoes?.filter(p => calcStatusPregao(p.data_vencimento) !== 'VENCIDO').map(p => {
                  const fornecedorStr = p.fornecedor?.nome_fantasia || p.fornecedor?.razao_social
                  return (
                    <option key={p.id} value={p.id}>
                      {p.numero_pregao} — {p.objeto} {fornecedorStr ? `(${fornecedorStr})` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="stat-label block mb-1">Status dos Itens</label>
              <select
                className="input max-w-[180px]"
                value={filtros.status_pedidos_pregao ?? 'TODOS'}
                onChange={e => setFiltro('status_pedidos_pregao', e.target.value as any)}
              >
                <option value="TODOS">Todos os itens</option>
                <option value="COM_PEDIDOS">Com Pedidos Realizados</option>
                <option value="COM_SALDO">Com Saldo Disponível</option>
                <option value="SEM_SALDO">Sem Saldo (Esgotados)</option>
              </select>
            </div>
          </>
        )}

        <div>
          <label className="stat-label block mb-1">Subitem</label>
          <select className="input max-w-[140px]" value={filtros.si ?? 'TODOS'} onChange={e => setFiltro('si', e.target.value)}>
            <option value="TODOS">Todos</option>
            {sisUnicos.map(si => (
              <option key={si} value={si}>SI {si.padStart(2, '0')} — {getSiTitulo(si) || `Subitem ${si}`}</option>
            ))}
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
        <div>
          <label className="stat-label block mb-1">Itens por pág.</label>
          <select className="input max-w-[140px]" value={filtros.por_pagina} onChange={e => setFiltro('por_pagina', Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>Todos ({itens.length})</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-xs text-surface-400">
            {itens.length} item(s) {totalPags > 1 ? `(Pág. ${filtros.pagina}/${totalPags})` : ''} | Alvo: {filtros.cobertura_alvo} meses
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary !py-1.5 flex items-center gap-1.5"
              onClick={exportarPDF}
              title="Exportar para PDF"
            >
              <FileText size={14} />
              PDF
            </button>
            <button
              className="btn-secondary !py-1.5 flex items-center gap-1.5"
              onClick={exportarXLSX}
              title="Exportar para Excel"
            >
              <FileSpreadsheet size={14} />
              XLSX
            </button>
            <button
              className="btn-primary !py-1.5 flex items-center gap-1.5"
              onClick={() => setModalAvulsoOpen(true)}
            >
              <Plus size={14} />
              Item Avulso
            </button>
          </div>
        </div>
      </div>

      {modalAvulsoOpen && (
        <ModalAdicionarAvulso
          pregoes={pregoes || []}
          onClose={() => setModalAvulsoOpen(false)}
          onAdd={(item, qtd) => {
            adicionarAoCarrinho(item, qtd)
            setModalAvulsoOpen(false)
          }}
        />
      )}

      {carrinho.size > 0 && (
        <div className="space-y-3">
          {/* Barra de resumo do carrinho */}
          <div className="card p-3 flex items-center gap-3 border-primary-500/30 bg-primary-900/20 flex-wrap">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary-400" />
              <span className="text-sm text-primary-300 font-medium">{carrinho.size} item(s) no carrinho</span>
            </div>
            <span className="text-xs text-surface-400">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-surface-300">Total carrinho:</span>
              <span className="font-semibold text-surface-100">{formatCurrency(carrinhoValorTotal)}</span>
            </div>
            {carrinhoBudgetTotal.totalDisponivel > 0 && (
              <>
                <span className="text-xs text-surface-400">|</span>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-surface-300">Disponível NC:</span>
                  <span className="font-semibold text-emerald-400">{formatCurrency(carrinhoBudgetTotal.totalDisponivel)}</span>
                </div>
                {carrinhoBudgetTotal.totalDisponivel >= carrinhoValorTotal && (
                  <>
                    <span className="text-xs text-surface-400">|</span>
                    <div className="flex items-center gap-1.5 text-xs bg-amber-950/50 border border-amber-500/40 px-2.5 py-0.5 rounded-lg shadow-sm">
                      <span className="text-amber-200">Falta para inteirar:</span>
                      <strong className="text-amber-300 font-bold font-mono text-sm">{formatCurrency(carrinhoBudgetTotal.restante)}</strong>
                    </div>
                  </>
                )}
              </>
            )}
            <button
              className="btn-primary ml-auto !py-1.5 flex items-center gap-1.5"
              onClick={() => { setObsModal(''); setErroPedido(null); setModalPedido(true) }}
            >
              <ClipboardList size={14} />
              Salvar Pedido
            </button>
          </div>

          {/* Painel de Orçamento por SI */}
          {carrinhoSiStats.length > 0 && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={14} className="text-emerald-400" />
                <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider">Orçamento por Subitem (NC)</span>
              </div>
              {carrinhoSiStats.map(stat => {
                const pct = stat.disponivel > 0 ? Math.min(100, (stat.comprometido / stat.disponivel) * 100) : 0
                const sisComNc = getSisComNC()
                return (
                  <div key={stat.si} className="space-y-1.5">
                    <div className="flex items-start justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn('font-mono font-semibold', stat.excedido ? 'text-red-300' : 'text-surface-200')}>
                            {stat.si === 'S/SI' ? 'Itens Sem SI Atribuído' : `SI ${stat.si} — ${getSiTitulo(stat.si)}`}
                          </span>
                        </div>
                        {/* Itens do carrinho que usam este SI, com opção de trocar */}
                        <div className="mt-1 space-y-0.5">
                          {[...carrinho.entries()]
                            .filter(([, item]) => (item.si ? item.si.padStart(2, '0') : 'S/SI') === stat.si)
                            .map(([cd, item]) => {
                              const isUnmappedOrAvulso = cd.startsWith('UNMAPPED-') || cd.startsWith('AVULSO-')
                              const labelItem = isUnmappedOrAvulso
                                ? `${item.numero_item ? `Item ${item.numero_item} — ` : ''}${item.nomenclatura || 'Item do Pregão'}`
                                : cd

                              return (
                                <div key={cd} className="flex items-center gap-1.5">
                                  <span 
                                    className={cn(
                                      "text-[10px] text-surface-400 truncate max-w-[280px] sm:max-w-[420px]",
                                      !isUnmappedOrAvulso ? "font-mono" : "font-sans"
                                    )} 
                                    title={item.nomenclatura || cd}
                                  >
                                    {labelItem}
                                  </span>
                                {trocandoSi === cd ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {sisComNc.map(si => (
                                      <button
                                        key={si}
                                        type="button"
                                        onClick={() => trocarSiNoCarrinho(cd, si)}
                                        className={cn(
                                          'text-[9px] px-1.5 py-0.5 rounded border transition-all',
                                          si === stat.si
                                            ? 'bg-primary-600/40 text-primary-200 border-primary-500/50'
                                            : 'bg-surface-700 text-surface-300 border-surface-600 hover:border-primary-500/40'
                                        )}
                                      >
                                        SI {si}
                                      </button>
                                    ))}
                                    <button onClick={() => setTrocandoSi(null)} className="text-[9px] text-surface-500 hover:text-surface-300">✕</button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setTrocandoSi(cd)}
                                    className="text-[9px] text-primary-400 hover:text-primary-300 underline underline-offset-2"
                                    title="Trocar SI para usar outro crédito de NC"
                                  >
                                    ⇄ trocar SI
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {stat.semNC ? (
                          <span className="text-surface-500 text-[10px]">sem NC cadastrada</span>
                        ) : stat.excedido ? (
                          <span className="flex items-center gap-1.5 text-red-400 text-[10px] font-semibold">
                            <AlertTriangle size={10} />
                            <span>{formatCurrency(stat.comprometido)} / {formatCurrency(stat.disponivel)}</span>
                            <span className="text-red-300 font-bold ml-1 bg-red-950/60 border border-red-700/50 px-1.5 py-0.5 rounded">
                              Excesso: {formatCurrency(stat.comprometido - stat.disponivel)}
                            </span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 text-[10px] flex-wrap justify-end">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 size={10} />
                              <span className="font-semibold text-emerald-300">{formatCurrency(stat.comprometido)}</span>
                              <span className="text-surface-400">/</span>
                              <span className="text-surface-200">{formatCurrency(stat.disponivel)}</span>
                            </span>
                            {stat.disponivel > stat.comprometido && (
                              <span className="inline-flex items-center gap-1 text-amber-300 font-bold bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded shadow-sm">
                                <span className="font-sans text-[9px] uppercase tracking-wider text-amber-400 font-semibold">Falta para inteirar:</span>
                                <span className="font-mono text-[11px]">{formatCurrency(stat.disponivel - stat.comprometido)}</span>
                              </span>
                            )}
                          </div>
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

      <div className="card p-0 overflow-auto max-h-[calc(100vh-16rem)] custom-scrollbar">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-800 shadow-sm">
            <tr>
              {colHeaders.map(h => {
                const isSorted = ordemCol === h.colKey
                return (
                  <th key={h.label + (h.label2 ?? '') || 'acoes'}
                    className={`px-3 py-3 text-xs font-semibold text-surface-300 uppercase tracking-wider border-b border-surface-600/60 ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left'} ${h.colKey ? 'cursor-pointer select-none hover:text-primary-300 transition-colors' : ''}`}
                    onClick={() => h.colKey && handleSort(h.colKey)}
                  >
                    <div className={`flex flex-col items-${h.align === 'right' ? 'end' : h.align === 'center' ? 'center' : 'start'} leading-tight`}>
                      <div className={`flex items-center gap-0.5`}>
                        <span>{h.label}</span>
                        {h.colKey && (
                          <span className="text-surface-400 inline-flex items-center">
                            {isSorted ? (
                              ordemDirecao === 'asc' ? <ArrowUp size={12} className="text-primary-400" /> : <ArrowDown size={12} className="text-primary-400" />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40 hover:opacity-100" />
                            )}
                          </span>
                        )}
                      </div>
                      {h.label2 && <span className="text-surface-200 normal-case tracking-wide font-semibold text-[11px]">{h.label2}</span>}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {paginados.map((item, index) => {
              const isUnmapped = item.cd_comp_master.startsWith('UNMAPPED-')
              const cobStr = isUnmapped ? '—' : item.cobertura_meses >= 9999 ? '∞' : `${formatNumber(item.cobertura_meses, 1)} m`
              const cobColor = isUnmapped ? 'text-surface-500' : item.criticidade === 'CRITICO' ? 'text-red-400' : item.criticidade === 'BAIXO' ? 'text-orange-400' : item.criticidade === 'NORMAL' ? 'text-amber-400' : 'text-emerald-400'
              
              const rowKey = modoVisao === 'PREGAO' ? `pregao-${item.item_pregao_id || index}` : item.cd_comp_master

              const pregoesList = item.pregoes_disponiveis || []
              const selectedPregaoId = pregaoSelecionadoPorMaster[item.cd_comp_master] ?? pregoesList[0]?.id
              const selectedPregao = pregoesList.find(p => p.id === selectedPregaoId) ?? pregoesList[0]

              const saldoToShow = selectedPregao ? selectedPregao.saldo_empenho : item.saldo_pregoes
              const custoToShow = selectedPregao ? selectedPregao.valor_unitario : item.custo_unitario_pregao

              return (
                <tr key={rowKey} className="hover:bg-surface-700/30 transition-colors border-b border-surface-700/50 last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      {modoVisao === 'PREGAO' && (
                        <div className="shrink-0 flex items-center justify-center bg-primary-900/40 text-primary-300 font-bold w-6 h-6 rounded text-[10px] mt-0.5 border border-primary-500/20" title="Item do Pregão">
                          {selectedPregao?.numero_item || item.numero_item_pregao}
                        </div>
                      )}
                      <div>
                        <p className="font-mono text-xs text-primary-300">
                          {!isUnmapped ? item.cd_comp_master : <span className="text-surface-500 italic font-sans text-[10px]">Sem Código MASTER</span>}
                          {(item as any).campos_corrigidos?.length > 0 && <span className="ml-1 inline-flex"><Sparkles size={9} className="text-amber-400" /></span>}
                        </p>
                        {modoVisao === 'PREGAO' ? (() => {
                          const prgItem = selectedPregao || item.pregoes_disponiveis?.[0]
                          const modeloMarca = prgItem?.descricao_tr
                            ? extrairModeloMarcaRef(prgItem.descricao_tr)
                            : (prgItem?.descricao ? 'SEM TERMO DE REFERENCIA' : item.nomenclatura)
                          return (
                            <ItemDescTooltip
                              titulo={
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs max-w-[200px] truncate block font-medium text-surface-100">
                                    {modeloMarca}
                                  </span>
                                  {!isUnmapped && (
                                    <span className="text-[10px] text-surface-400 truncate max-w-[200px]">
                                      MASTER: {item.nomenclatura}
                                    </span>
                                  )}
                                </div>
                              }
                              descricaoCompleta={
                                <ResumoTRTooltipContent
                                  texto={prgItem?.descricao_tr || prgItem?.descricao || item.nomenclatura}
                                  tituloItem={`Item ${prgItem?.numero_item || item.numero_item_pregao} — ${modeloMarca}`}
                                  numeroItem={prgItem?.numero_item || item.numero_item_pregao}
                                />
                              }
                            />
                          )
                        })() : (
                          <ItemDescTooltip
                            titulo={
                              <span className={cn('text-xs max-w-[200px] truncate block', isUnmapped ? 'text-surface-400 italic font-medium' : (item as any).campos_corrigidos?.includes('nomenclatura') ? 'text-amber-200' : 'text-surface-200')}>
                                {item.nomenclatura}
                              </span>
                            }
                            descricaoCompleta={
                              (item as any).campos_corrigidos?.includes('nomenclatura') ? (
                                <div className="space-y-1.5 font-sans text-left whitespace-pre-wrap">
                                  <div className="text-[10px] font-bold tracking-wider text-primary-400 uppercase pb-1 border-b border-surface-700/60 flex items-center justify-between">
                                    <span>DADOS CORRIGIDOS</span>
                                    {item.numero_item_pregao && <span className="text-[9px] text-surface-400 font-normal">Item {item.numero_item_pregao}</span>}
                                  </div>
                                  <div className="text-surface-200 leading-relaxed text-xs">
                                    {item.nomenclatura}
                                  </div>
                                </div>
                              ) : (
                                <ResumoTRTooltipContent
                                  texto={item.nomenclatura}
                                  tituloItem={isUnmapped ? 'Termo de Referência' : 'Componente MASTER'}
                                  numeroItem={item.numero_item_pregao}
                                />
                              )
                            }
                          />
                        )}
                        {!isUnmapped && (
                          <p className="text-[10px] text-surface-300 mt-0.5">
                            ND {item.nd} / SI {item.si}
                            {item.si && <span className="text-surface-400 block truncate max-w-[200px]">{getSiTitulo(item.si)}</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-surface-400">
                    {isUnmapped ? <span className="text-surface-600">—</span> : (
                      <>
                        <p>{item.pn ?? '—'}</p>
                        <p className="text-surface-300">{item.mpn ?? '—'}</p>
                      </>
                    )}
                  </td>
                  <td className={cn('px-3 py-3 text-right text-sm font-semibold', isUnmapped ? 'text-surface-600' : (item as any).campos_corrigidos?.includes('estoque') ? 'text-amber-300' : 'text-surface-100')}
                    title={!isUnmapped && (item as any).campos_corrigidos?.includes('estoque') ? 'DADOS CORRIGIDOS' : undefined}>
                    {isUnmapped ? '—' : item.estoque_atual}
                  </td>
                  <td className={cn("px-3 py-3 text-right text-sm font-semibold", item.pedidos_pendentes > 0 ? "text-amber-300" : isUnmapped ? "text-surface-600" : "text-surface-400")}>
                    {item.pedidos_pendentes > 0 ? (
                      <ItemDescTooltip
                        titulo={
                          <span
                            className="font-bold underline decoration-dotted decoration-amber-400/60 underline-offset-4 cursor-help hover:text-amber-200 transition-colors inline-block"
                            title={(item.pedidos_pendentes_detalhes ?? [])
                              .map(d => `Pedido #${String(d.pedido_numero).padStart(4, '0')}: ${d.quantidade} un.`)
                              .join('\n') || `Qtd pendente: ${item.pedidos_pendentes}`}
                          >
                            {item.pedidos_pendentes}
                          </span>
                        }
                        descricaoCompleta={
                          <div className="space-y-2 font-sans text-left min-w-[220px]">
                            <div className="text-[11px] font-bold tracking-wider text-amber-400 uppercase pb-1 border-b border-surface-700/60 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span>📦</span>
                                <span>Pedidos Pendentes</span>
                              </span>
                              <span className="text-amber-200 font-mono text-xs bg-amber-950/70 px-2 py-0.5 rounded border border-amber-500/40">
                                Total: {item.pedidos_pendentes} un.
                              </span>
                            </div>

                            <div className="space-y-1.5 pt-0.5">
                              {item.pedidos_pendentes_detalhes && item.pedidos_pendentes_detalhes.length > 0 ? (
                                item.pedidos_pendentes_detalhes.map((det, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-surface-800/90 border border-surface-700/60 shadow-sm"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-surface-100">
                                        Pedido #{String(det.pedido_numero).padStart(4, '0')}
                                      </span>
                                      {det.status && (
                                        <span className={cn(
                                          "text-[9px] px-1.5 py-0.5 rounded font-sans uppercase tracking-wider font-medium",
                                          det.status === 'RASCUNHO' ? "bg-amber-950/60 text-amber-300 border border-amber-800/50" :
                                          det.status === 'FINALIZADO' ? "bg-primary-950/60 text-primary-300 border border-primary-800/50" :
                                          "bg-surface-700 text-surface-300"
                                        )}>
                                          {det.status === 'RASCUNHO' ? 'Rascunho' : det.status === 'FINALIZADO' ? 'Finalizado' : det.status}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-mono font-extrabold text-amber-300">
                                      {det.quantidade} un.
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-surface-400 italic">
                                  {item.pedidos_pendentes} un. solicitada(s) em pedido pendente.
                                </div>
                              )}
                            </div>
                          </div>
                        }
                      />
                    ) : (modoVisao === 'PREGAO' || !isUnmapped) ? (
                      0
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className="px-3 py-3 text-right text-sm text-sky-300 font-semibold font-mono"
                    title={item.quantidade_licitada != null ? `Licitado: ${item.quantidade_licitada.toLocaleString('pt-BR')} | Empenhado: ${(item.quantidade_empenhada ?? 0).toLocaleString('pt-BR')} | Saldo: ${saldoToShow.toLocaleString('pt-BR')}` : undefined}
                  >
                    {saldoToShow.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-3 text-right text-xs font-semibold text-violet-300 font-mono">
                    {custoToShow != null
                      ? custoToShow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : <span className="text-surface-500">—</span>}
                  </td>
                  <td className={cn('px-3 py-3 text-right text-xs', isUnmapped ? 'text-surface-600' : (item as any).campos_corrigidos?.includes('media_anual') ? 'text-amber-300 font-semibold' : 'text-surface-300')}
                    title={!isUnmapped && (item as any).campos_corrigidos?.includes('media_anual') ? 'DADOS CORRIGIDOS' : undefined}>
                    {isUnmapped ? '—' : formatNumber(item.media_mensal, 2)}
                  </td>
                  <td className={`px-3 py-3 text-right text-sm font-semibold ${cobColor}`}>{cobStr}</td>
                  <td className="px-3 py-3 text-center">
                    {pregoesList.length > 0
                      ? (
                        <div className="flex flex-col gap-1 items-center justify-center">
                          {pregoesList.map(p => {
                            const isSelected = p.id === selectedPregaoId
                            const isImpedido = !!p.impedido

                            if (isImpedido) {
                              return (
                                <div key={p.id} className="cursor-help">
                                  <ItemDescTooltip
                                    titulo={
                                      <span className={cn(
                                        "text-[10px] font-semibold inline-flex items-center px-1.5 py-0.5 rounded transition-colors",
                                        "bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30"
                                      )}>
                                        <AlertTriangle size={10} className="mr-1 text-amber-400" />
                                        {pregoesList.length === 1 ? 'Impedido' : `Impedido (${p.numero_pregao})`}
                                      </span>
                                    }
                                    descricaoCompleta={
                                      <div className="p-2.5 max-w-xs text-xs space-y-1.5 text-left font-sans">
                                        <div className="flex items-center gap-1.5 text-amber-400 font-bold border-b border-surface-700/60 pb-1">
                                          <AlertTriangle size={14} />
                                          <span>Fornecedor Impedido de Empenho</span>
                                        </div>
                                        <div className="text-surface-200">
                                          <span className="font-semibold text-surface-400">Empresa: </span>
                                          {p.fornecedor_nome || 'Empresa Vencedora'}
                                          {p.fornecedor_cnpj ? ` (${p.fornecedor_cnpj})` : ''}
                                        </div>
                                        <div className="p-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200">
                                          <span className="font-bold text-amber-300 block mb-0.5">Motivo do Impedimento:</span>
                                          {p.motivo_impedimento || 'Fornecedor impossibilitado de receber novos empenhos no momento.'}
                                        </div>
                                        <div className="text-[11px] text-surface-400">
                                          Pregão {p.numero_pregao} • Item {p.numero_item}
                                        </div>
                                        <div className="text-[10px] text-red-300/90 font-medium">
                                          Item bloqueado para novos pedidos de empenho.
                                        </div>
                                      </div>
                                    }
                                  />
                                </div>
                              )
                            }

                            const modeloMarca = (p as any).descricao_tr
                              ? extrairModeloMarcaRef((p as any).descricao_tr)
                              : ((p as any).descricao ? 'SEM TERMO DE REFERENCIA' : '')

                            return (
                              <div key={p.id} onClick={() => setPregaoSelecionadoPorMaster(prev => ({ ...prev, [item.cd_comp_master]: p.id }))} className="cursor-pointer">
                                <ItemDescTooltip
                                  titulo={
                                    <div className="flex flex-col items-center">
                                      <span className={cn("text-[10px] font-medium inline-flex items-center px-1.5 py-0.5 rounded transition-colors", 
                                        isSelected ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50" : "bg-surface-700/50 text-surface-400 hover:text-surface-200"
                                      )}>
                                        {isSelected && <CheckCircle2 size={10} className="mr-1" />}
                                        {pregoesList.length === 1 ? '✓ Sim' : p.numero_pregao}
                                      </span>
                                      {modeloMarca && (
                                        <span className="text-[9px] text-surface-400 font-medium truncate max-w-[130px] mt-0.5">
                                          {modeloMarca}
                                        </span>
                                      )}
                                    </div>
                                  }
                                  descricaoCompleta={
                                    <ResumoTRTooltipContent
                                      texto={(p as any).descricao_tr || p.descricao}
                                      tituloItem={`Pregão ${p.numero_pregao} (Item ${p.numero_item}) — ${modeloMarca || 'Item'}`}
                                      numeroItem={p.numero_item}
                                    />
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      )
                      : <span className="text-red-400 text-xs flex items-center gap-1 justify-center"><AlertTriangle size={10} />Não</span>
                    }
                  </td>
                  <td className="px-3 py-3">
                    {isUnmapped ? (
                      <span className="badge bg-surface-700/50 text-surface-400 border border-surface-600/40">Não mapeado</span>
                    ) : (
                      <span className={CRIT_BADGE[item.criticidade]}>{CRIT_LABEL[item.criticidade]}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-surface-50">
                    {isUnmapped ? '—' : item.quantidade_sugerida > 0 ? item.quantidade_sugerida.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={qtdsCompra.get(item.cd_comp_master) ?? (isUnmapped ? 1 : item.quantidade_sugerida > 0 ? item.quantidade_sugerida : 1)}
                      onChange={e => {
                        const v = Math.max(1, parseInt(e.target.value) || 1)
                        setQtdsCompra(prev => { const n = new Map(prev); n.set(item.cd_comp_master, v); return n })
                      }}
                      className="w-20 text-right text-sm font-bold text-surface-50 bg-surface-700/60 border border-surface-600/60 rounded-lg px-2 py-1 focus:outline-none focus:border-primary-500/60 focus:ring-1 focus:ring-primary-500/30 transition-colors"
                    />
                  </td>
                  <td className="px-3 py-3">
                    {carrinho.has(item.cd_comp_master) ? (
                      <button
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-700/40 rounded px-2 py-1 hover:bg-red-900/20 transition-colors"
                        onClick={() => removerDoCarrinho(item.cd_comp_master)}
                      >
                        <X size={11} /> Remover
                      </button>
                    ) : selectedPregao?.impedido ? (
                      <button
                        className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-amber-950/40 text-amber-400/80 border border-amber-600/40 opacity-70 hover:opacity-100 cursor-not-allowed"
                        title={`Item bloqueado: fornecedor impedido de empenho (${selectedPregao.motivo_impedimento || 'Restrição cadastrada'})`}
                        onClick={() => alert(`Este item não pode ser adicionado ao carrinho pois o fornecedor está IMPEDIDO DE EMPENHO.\n\nMotivo: ${selectedPregao.motivo_impedimento || 'Restrição cadastrada no sistema'}`)}
                      >
                        <AlertTriangle size={11} className="text-amber-400" /> Impedido
                      </button>
                    ) : (
                      <button className="btn-primary !py-1 !px-2 !text-xs"
                        onClick={() => adicionarAoCarrinho(item)}>
                        <ShoppingCart size={12} /> Add
                      </button>
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

      {/* Modal de alerta de Orçamento excedido (por PI / pool) */}
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

      {/* Modal Salvar Pedido */}
      {modalPedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-primary-400" />
                <h2 className="text-base font-semibold text-surface-50">Salvar Pedido de Compra</h2>
              </div>
              <button onClick={() => setModalPedido(false)} className="text-surface-400 hover:text-surface-200">
                <X size={16} />
              </button>
            </div>

            <div className="bg-surface-700/40 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Itens no carrinho</span>
                <span className="text-surface-100 font-semibold">{carrinho.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Valor estimado total</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(carrinhoValorTotal)}</span>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
              {Array.from(carrinho.entries()).map(([cd, item]) => {
                const isUnmappedOrAvulso = cd.startsWith('UNMAPPED-') || cd.startsWith('AVULSO-')
                const labelItem = isUnmappedOrAvulso
                  ? `${item.numero_item ? `Item ${item.numero_item} — ` : ''}${item.nomenclatura || 'Item do Pregão'}`
                  : (item.nomenclatura || cd)
                return (
                  <div key={cd} className="flex justify-between text-surface-300 border-b border-surface-700/30 pb-1">
                    <span className="truncate max-w-[60%]" title={item.nomenclatura || cd}>{labelItem}</span>
                    <span className="text-surface-400 shrink-0 ml-2">{item.qtd} un × {formatCurrency(item.valor_unitario)}</span>
                  </div>
                )
              })}
            </div>

            {/* Seção de Vínculo com Nota de Crédito */}
            {ncsDisponiveisParaCarrinho.length === 0 ? (
              <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <span>Nenhuma Nota de Crédito ativa encontrada</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  {sisDoCarrinho.length > 0
                    ? `Não há NC com saldo aberta para o(s) Subitem(ns) ${sisDoCarrinho.join(', ')}.`
                    : 'Nenhum Subitem identificado nos itens do carrinho.'}
                </p>
              </div>
            ) : ncsDisponiveisParaCarrinho.length === 1 ? (
              (() => {
                const nc = ncsDisponiveisParaCarrinho[0]
                const saldoNC = saldoPorNC[nc.id] ?? Number(nc.valor)
                return (
                  <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-surface-300 font-medium">Nota de Crédito Vinculada:</span>
                      <span className="badge bg-sky-900/60 text-sky-200 border border-sky-700/50 font-mono text-xs">
                        NC: {nc.numero_nc || 'S/N'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-surface-400">
                      <span className="truncate max-w-[200px]" title={nc.descricao || ''}>
                        {nc.descricao || (nc.si ? `SI ${nc.si.padStart(2, '0')}` : nc.plano_interno)}
                      </span>
                      <span>
                        Saldo disponível:{' '}
                        <strong className="text-emerald-400 font-semibold">{formatCurrency(saldoNC)}</strong>
                      </span>
                    </div>
                    {carrinhoValorTotal > saldoNC && (
                      <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1">
                        <AlertTriangle size={12} className="shrink-0" />
                        Atenção: O total do pedido ({formatCurrency(carrinhoValorTotal)}) excede o saldo disponível nesta NC.
                      </p>
                    )}
                  </div>
                )
              })()
            ) : (
              <div className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-200">
                      Atenção: Múltiplas Notas de Crédito Ativas
                    </p>
                    <p className="text-[11px] text-amber-300/80">
                      Existem {ncsDisponiveisParaCarrinho.length} NCs em aberto. Defina obrigatoriamente de qual NC será descontado este pedido:
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-surface-300 block mb-1">
                    Selecione a Nota de Crédito <span className="text-red-400">*</span>
                  </label>
                  <select
                    className="input w-full text-xs font-mono py-1.5 bg-surface-800 border-surface-600 focus:border-amber-500"
                    value={ncSelecionadaId}
                    onChange={e => {
                      setNcSelecionadaId(e.target.value)
                      setErroPedido(null)
                    }}
                  >
                    <option value="">-- Selecione a NC para abater o pedido --</option>
                    {ncsDisponiveisParaCarrinho.map(nc => {
                      const saldoNC = saldoPorNC[nc.id] ?? Number(nc.valor)
                      const idVal = nc.numero_nc || nc.id
                      const label = `NC ${nc.numero_nc || nc.id} | Saldo: ${formatCurrency(saldoNC)} | ${nc.descricao || (nc.si ? `SI ${nc.si.padStart(2, '0')}` : nc.plano_interno || '')}`
                      return (
                        <option key={nc.id} value={idVal}>
                          {label}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {ncSelecionadaId && (() => {
                  const ncAtual = ncsDisponiveisParaCarrinho.find(n => (n.numero_nc || n.id) === ncSelecionadaId || n.id === ncSelecionadaId)
                  if (!ncAtual) return null
                  const saldoAtual = saldoPorNC[ncAtual.id] ?? Number(ncAtual.valor)
                  return (
                    <div className="flex justify-between text-xs pt-1 border-t border-amber-800/30">
                      <span className="text-surface-300">Saldo da NC selecionada:</span>
                      <span className={cn('font-semibold', carrinhoValorTotal > saldoAtual ? 'text-red-400' : 'text-emerald-400')}>
                        {formatCurrency(saldoAtual)}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            <div>
              <label className="stat-label block mb-1">Observações (opcional)</label>
              <textarea
                className="input w-full h-20 resize-none text-sm"
                placeholder="Ex: Urgente, aguardar aprovação, etc."
                value={obsModal}
                onChange={e => setObsModal(e.target.value)}
              />
            </div>

            {erroPedido && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} /> {erroPedido}
              </p>
            )}

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setModalPedido(false)} disabled={salvandoPedido}>
                Cancelar
              </button>
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={salvandoPedido}
                onClick={async () => {
                  if (ncsDisponiveisParaCarrinho.length > 1 && !ncSelecionadaId) {
                    setErroPedido('Por favor, selecione qual Nota de Crédito abaterá este pedido.')
                    return
                  }

                  setSalvandoPedido(true)
                  setErroPedido(null)

                  let numNcParaGravar: string | null = null
                  if (ncsDisponiveisParaCarrinho.length === 1) {
                    numNcParaGravar = ncsDisponiveisParaCarrinho[0].numero_nc || ncsDisponiveisParaCarrinho[0].id
                  } else if (ncSelecionadaId) {
                    const ncObj = ncsDisponiveisParaCarrinho.find(n => (n.numero_nc || n.id) === ncSelecionadaId || n.id === ncSelecionadaId)
                    numNcParaGravar = ncObj?.numero_nc || ncObj?.id || ncSelecionadaId
                  }

                  const obsFinal = formatarObservacoesComNc(obsModal.trim() || null, numNcParaGravar)
                  const itensArr = Array.from(carrinho.entries()).map(([cdCompMaster, item]) => ({ cdCompMaster, item }))
                  const { error } = await criarPedidoCompra(itensArr, obsFinal, user?.email ?? null)
                  
                  if (!error && rascunhoEditandoId) {
                    // Remove o rascunho antigo após criar o novo com sucesso
                    await deletePedidoCompra(rascunhoEditandoId)
                  }

                  if (error) {
                    setSalvandoPedido(false)
                    setErroPedido(error)
                  } else {
                    await useNotasCreditoStore.getState().recalcStore()
                    setSalvandoPedido(false)
                    setCarrinho(new Map())
                    setModalPedido(false)
                    navigate('/pedidos')
                  }
                }}
              >
                {salvandoPedido ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {salvandoPedido ? 'Salvando...' : 'Confirmar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

