import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Clock, RefreshCw, Loader2, Building2, Trash2, AlertTriangle, Printer, FileEdit,
  Pencil, Check, X, Search, BarChart3,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getPedidosCompra, atualizarStatusPedidoCompra, atualizarObservacoesPedidoCompra, deletePedidoCompra, deleteItemPedidoCompra, getNotasCredito, getPregoes } from '@/lib/api'
import { formatCurrency, cn, extrairNcDeObservacoes, formatarObservacoesComNc } from '@/lib/utils'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import { getPiFromSi, SI_NAMES } from '@/lib/ementario'
import type { PedidoCompra, StatusPedidoCompra, NotaCredito, ItemPedidoCompra } from '@/types'
import { EspelhoModal } from '@/components/EspelhoModal'
import { RelatorioPedidosAnoModal } from '@/components/RelatorioPedidosAnoModal'
import ItemDescTooltip, { ResumoTRTooltipContent } from '@/components/ui/ItemDescTooltip'

const STATUS_CONFIG: Record<StatusPedidoCompra, { label: string; className: string; icon: React.ReactNode }> = {
  RASCUNHO:   { label: 'Rascunho',   className: 'bg-amber-900/50 text-amber-300 border-amber-700/40',       icon: <Clock size={10} /> },
  FINALIZADO: { label: 'Finalizado', className: 'bg-primary-900/50 text-primary-300 border-primary-700/40', icon: <CheckCircle2 size={10} /> },
  ENTREGUE:   { label: 'Entregue',   className: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40', icon: <CheckCircle2 size={10} /> },
  CANCELADO:  { label: 'Cancelado',  className: 'bg-red-900/50 text-red-300 border-red-700/40',             icon: <XCircle size={10} /> },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatCNPJ(cnpj: string | null | undefined) {
  if (!cnpj) return '—'
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
}

/** Extrai a primeira linha / título curto da descrição do pregão */
function tituloDescricao(desc: string | null | undefined, maxLen = 60): string {
  if (!desc) return '—'
  const primeira = desc.split(/[\n;]/)[0].trim()
  return primeira.length > maxLen ? primeira.slice(0, maxLen) + '…' : primeira
}

/** Mapa numero_pregao ou item_pregao_id → { objeto, nup, numero_pregao_atual } */
type PregaoMap = Map<string, { objeto: string; nup: string | null; numero_pregao_atual: string }>

function imprimirPedidoPDF(pedido: PedidoCompra, ncs: NotaCredito[], pregaoMap: PregaoMap) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('GERSUP — Pedido de Compra', 10, 9)
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.setFont('helvetica', 'normal')
  doc.text(`Pedido #${String(pedido.numero).padStart(4, '0')}  |  ${formatDate(pedido.criado_em)}  |  Status: ${STATUS_CONFIG[pedido.status].label}`, 10, 16)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageW - 10, 16, { align: 'right' })

  let cursorY = 27

  const { numeroNc, textoLimpo } = extrairNcDeObservacoes(pedido.observacoes)
  if (numeroNc || textoLimpo) {
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    const textoObsFinal = [numeroNc ? `NC: ${numeroNc}` : null, textoLimpo ? `Obs: ${textoLimpo}` : null].filter(Boolean).join('  |  ')
    doc.text(textoObsFinal, 10, cursorY)
    cursorY += 6
  }

  const itens = pedido.itens ?? []

  // ── Agrupar por Pregão → Empresa → NC ──────────────────────────────────────
  const porPregao = new Map<string, Map<string, typeof itens>>()
  for (const item of itens) {
    const pregaoInfo = item.item_pregao_id ? pregaoMap.get(item.item_pregao_id) : pregaoMap.get(item.numero_pregao ?? '')
    const pregao = pregaoInfo?.numero_pregao_atual || item.numero_pregao || 'Sem Pregão'
    const empresa = item.fornecedor_nome ?? 'Empresa não identificada'
    
    const siRef = item.si ?? ''
    const pi = siRef ? (getPiFromSi(siRef.padStart(2, '0')) ?? '—') : '—'
    
    let ncId = 'sem-nc'
    if (numeroNc) {
      const ncEncontrada = ncs.find(n => n.numero_nc === numeroNc || n.id === numeroNc)
      if (ncEncontrada) ncId = ncEncontrada.id
    } else if (pi !== '—') {
      const siPad = siRef.padStart(2, '0')
      const ncEspecifica = ncs.find(n => n.si && n.si.padStart(2, '0') === siPad && n.plano_interno === pi)
      const ncPool = ncs.find(n => n.plano_interno === pi && (!n.si || n.si.trim() === ''))
      const ncQualquer = ncs.find(n => n.plano_interno === pi)
      const nc = ncEspecifica || ncPool || ncQualquer
      if (nc) ncId = nc.id
    }

    const groupingKey = `${empresa}::${ncId}`

    if (!porPregao.has(pregao)) porPregao.set(pregao, new Map())
    const porEmpresa = porPregao.get(pregao)!
    if (!porEmpresa.has(groupingKey)) porEmpresa.set(groupingKey, [])
    porEmpresa.get(groupingKey)!.push(item)
  }

  let subNum = 0
  for (const [pregao, porEmpresa] of porPregao) {
    subNum++

    // ── Cabeçalho de seção (Pregão) ───────────────────────────────────────
    if (cursorY > 175) { doc.addPage(); cursorY = 15 }
    const pregaoInfo = pregaoMap.get(pregao)
    const objeto = pregaoInfo?.objeto ?? ''
    const nup = pregaoInfo?.nup ?? null
    doc.setFillColor(30, 41, 59)
    // Altura variável: 8 base, +5 se tem objeto, +5 se tem NUP
    const secH = objeto ? (nup ? 19 : 13) : (nup ? 13 : 8)
    doc.rect(10, cursorY - 1, pageW - 20, secH, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`Pregão ${pregao}`, 13, cursorY + 4.5)
    if (nup) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(148, 163, 184)
      doc.text(`NUP: ${nup}`, pageW - 13, cursorY + 4.5, { align: 'right' })
    }
    if (objeto) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(203, 213, 225)
      // Trunca objeto para caber na linha
      const objTrunc = objeto.length > 130 ? objeto.slice(0, 130) + '…' : objeto
      doc.text(objTrunc, 13, cursorY + (nup ? 11.5 : 10.5))
    }
    cursorY += secH + 4

    let itemNum = 0
    for (const [groupingKey, itensDaEmpresa] of porEmpresa) {
      const empresa = groupingKey.split('::')[0]
      itemNum++

      // Dados PI/NC do primeiro item
      const siRef = itensDaEmpresa[0]?.si ?? ''
      const pi = siRef ? (getPiFromSi(siRef.padStart(2, '0')) ?? '—') : '—'
      
      let nc: NotaCredito | undefined = undefined
      if (pi !== '—') {
        const siPad = siRef.padStart(2, '0')
        nc = ncs.find(n => n.si && n.si.padStart(2, '0') === siPad && n.plano_interno === pi) 
          || ncs.find(n => n.plano_interno === pi && (!n.si || n.si.trim() === '')) 
          || ncs.find(n => n.plano_interno === pi)
      }
      const cnpj = itensDaEmpresa[0]?.fornecedor_cnpj
      const totalEmpresa = itensDaEmpresa.reduce((s, i) => s + i.valor_total, 0)

      // ── Subcabeçalho da Empresa ────────────────────────────────────────────
      if (cursorY > 175) { doc.addPage(); cursorY = 15 }
      doc.setFillColor(241, 245, 249)
      doc.rect(10, cursorY - 1, pageW - 20, 16, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(`${itemNum}.  ${empresa}`, 13, cursorY + 4)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(71, 85, 105)
      // Linha 1: CNPJ | PI | Total
      const linha1 = `CNPJ: ${formatCNPJ(cnpj)}   |   PI: ${pi}   |   Total: ${formatCurrency(totalEmpresa)}`
      doc.text(linha1, 13, cursorY + 9.5)
      // Linha 2: dados da NC (incluindo Nº NC e Data de Emissão)
      const ncNumero = nc?.numero_nc ? `Nº NC: ${nc.numero_nc}   ` : ''
      const ncData = nc?.data_emissao
        ? `Emissão: ${new Date(nc.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')}   `
        : ''
      const ncUgEmit = nc?.ug_emitente ? `UG Emit.: ${nc.ug_emitente}   ` : ''
      const linha2 = nc
        ? `${ncNumero}${ncData}${ncUgEmit}PTRES: ${nc.ptres}   UGR: ${nc.ugr}   Fonte: ${nc.fonte_recursos}   ND: ${nc.natureza_despesa}${nc.descricao ? `   (${nc.descricao})` : ''}`
        : `NC — não cadastrada para o PI ${pi}`
      doc.text(linha2, 13, cursorY + 14)
      cursorY += 20

      // ── Tabela de itens da empresa ──────────────────────────────────────────
      autoTable(doc, {
        startY: cursorY,
        margin: { left: 10, right: 10 },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          textColor: [30, 41, 59],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 6.5,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { fillColor: [255, 255, 255] },
        head: [[
          'SI', 'PI', 'Comp. MASTER', 'Descrição (TR)', 'Descrição (Pregão)', 'PN / MPN',
          'Item', 'Vl. Unit.', 'Qtd', 'Vl. Total', 'CM',
        ]],
        body: itensDaEmpresa.map(i => {
          const iSi = i.si ? i.si.padStart(2, '0') : ''
          const iPi = iSi ? (getPiFromSi(iSi) ?? '—') : '—'
          const masterLabel = (i.cd_comp_master.startsWith('AVULSO-') || i.cd_comp_master.startsWith('UNMAPPED-')) ? 'AVULSO' : i.cd_comp_master
          return [
            iSi || '—',
            iPi,
            masterLabel + (i.nomenclatura ? `\n${i.nomenclatura.slice(0, 35)}` : ''),
            (i.descricao_tr || i.descricao_pregao) ? ((i.descricao_tr || i.descricao_pregao)!.length > 150 ? (i.descricao_tr || i.descricao_pregao)!.slice(0, 150) + '…' : (i.descricao_tr || i.descricao_pregao)) : '—',
            tituloDescricao(i.descricao_pregao, 50) || '—',
            [i.pn, i.mpn].filter(Boolean).join(' / ') || '—',
            i.numero_item ?? '—',
            formatCurrency(i.valor_unitario),
            Number(i.quantidade).toLocaleString('pt-BR'),
            formatCurrency(i.valor_total),
            i.cm ?? '—',
          ]
        }),
        columnStyles: {
          0:  { halign: 'center', cellWidth: 8  },
          1:  { cellWidth: 24 },
          2:  { cellWidth: 34 },
          3:  { cellWidth: 65 },
          4:  { cellWidth: 50 },
          5:  { cellWidth: 25 },
          6:  { halign: 'center', cellWidth: 10 },
          7:  { halign: 'right',  cellWidth: 18 },
          8:  { halign: 'right',  cellWidth: 10 },
          9:  { halign: 'right',  cellWidth: 22 },
          10: { halign: 'center', cellWidth: 10 },
        },
        foot: [[
          '', '', '', '', '', '', '',
          'SUBTOTAL', '', formatCurrency(totalEmpresa), '',
        ]],
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 118, 110],
          fontStyle: 'bold',
          halign: 'right',
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
        },
        didDrawPage: () => {},
      })

      cursorY = (doc as any).lastAutoTable.finalY
      cursorY += 10
    } // fim loop empresas
  }

  // ── Rodapé: total geral ────────────────────────────────────────────────────
  if (cursorY > 182) { doc.addPage(); cursorY = 15 }
  doc.setDrawColor(203, 213, 225)
  doc.line(10, cursorY, pageW - 10, cursorY)
  cursorY += 4
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 118, 110)
  doc.text(`TOTAL GERAL DO PEDIDO: ${formatCurrency(pedido.valor_total)}`, pageW - 10, cursorY, { align: 'right' })

  doc.save(`pedido-${String(pedido.numero).padStart(4, '0')}.pdf`)
}

function removerAcentos(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function formatarSiComDescricao(si: string | null | undefined): string {
  if (!si || !si.trim()) return ''
  const pad = si.trim().padStart(2, '0')
  const nome = SI_NAMES[pad]
  return nome ? `SI ${pad} - ${nome}` : `SI ${pad}`
}

function getSisDoPedido(pedido: PedidoCompra): string[] {
  const sisSet = new Set<string>()
  for (const item of (pedido.itens ?? [])) {
    if (item.si && item.si.trim()) {
      sisSet.add(item.si.trim().padStart(2, '0'))
    }
  }
  return Array.from(sisSet).sort().map(formatarSiComDescricao)
}

function itemMatchesBusca(item: ItemPedidoCompra, pregaoMap: PregaoMap, qTokens: string[]): boolean {
  if (qTokens.length === 0) return true

  const pInfo = item.item_pregao_id ? pregaoMap.get(item.item_pregao_id) : pregaoMap.get(item.numero_pregao ?? '')
  const numPregao = pInfo?.numero_pregao_atual || item.numero_pregao || ''
  const nup = pInfo?.nup || ''
  const cnpjClean = (item.fornecedor_cnpj || '').replace(/\D/g, '')
  const cnpjFormatted = formatCNPJ(item.fornecedor_cnpj)
  const siRef = item.si ? item.si.padStart(2, '0') : ''
  const pi = siRef ? (getPiFromSi(siRef) ?? '') : ''
  const siNome = siRef ? (SI_NAMES[siRef] ?? '') : ''
  const itemNumStr = item.numero_item != null ? String(item.numero_item) : ''

  const rawParts = [
    itemNumStr ? `item ${itemNumStr}` : '',
    itemNumStr ? `#${itemNumStr}` : '',
    itemNumStr,
    item.pn || '',
    item.mpn || '',
    numPregao,
    nup,
    item.cd_comp_master || '',
    item.nomenclatura || '',
    item.si || '',
    siRef ? `si ${siRef}` : '',
    siRef ? `si${siRef}` : '',
    siNome,
    pi,
    item.descricao_tr || '',
    item.descricao_pregao || '',
    item.fornecedor_nome || '',
    cnpjClean,
    cnpjFormatted,
    item.cm || '',
  ]

  const normalizedCorpus = removerAcentos(rawParts.filter(Boolean).join(' '))

  return qTokens.every(token => {
    const tokenDigits = token.replace(/\D/g, '')
    if (tokenDigits.length >= 3 && cnpjClean.includes(tokenDigits)) {
      return true
    }
    return normalizedCorpus.includes(token)
  })
}

function pedidoMatchesBusca(
  pedido: PedidoCompra,
  pregaoMap: PregaoMap,
  busca: string
): { matches: boolean; matchingItemIds: Set<string>; headerMatched: boolean } {
  const qTrim = busca.trim()
  if (!qTrim) return { matches: true, matchingItemIds: new Set(), headerMatched: false }

  const qTokens = removerAcentos(qTrim).split(/\s+/).filter(Boolean)

  const matchingItemIds = new Set<string>()
  for (const item of (pedido.itens ?? [])) {
    if (itemMatchesBusca(item, pregaoMap, qTokens)) {
      matchingItemIds.add(item.id)
    }
  }

  const numStr = String(pedido.numero)
  const numPad = numStr.padStart(4, '0')
  const headerParts = [
    numStr,
    numPad,
    `#${numPad}`,
    `pedido #${numPad}`,
    `pedido ${numPad}`,
    pedido.observacoes || '',
    pedido.status || '',
    STATUS_CONFIG[pedido.status]?.label || '',
  ]
  const normalizedHeader = removerAcentos(headerParts.filter(Boolean).join(' '))
  const headerMatched = qTokens.every(token => normalizedHeader.includes(token))

  const matches = headerMatched || matchingItemIds.size > 0
  return { matches, matchingItemIds, headerMatched }
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([])
  const [ncs, setNcs] = useState<NotaCredito[]>([])
  const [pregaoMap, setPregaoMap] = useState<PregaoMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [mostrarTodosItens, setMostrarTodosItens] = useState<Record<string, boolean>>({})
  const [atualizando, setAtualizando] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [espelhoPedido, setEspelhoPedido] = useState<PedidoCompra | null>(null)
  const [editandoObsId, setEditandoObsId] = useState<string | null>(null)
  const [textoObs, setTextoObs] = useState('')
  const [salvandoObs, setSalvandoObs] = useState(false)
  const [modalRelatorioAberto, setModalRelatorioAberto] = useState(false)

  const navigate = useNavigate()

  function toggleExpandido(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function iniciarEdicaoObs(pedido: PedidoCompra, e: React.MouseEvent) {
    e.stopPropagation()
    setEditandoObsId(pedido.id)
    const { textoLimpo } = extrairNcDeObservacoes(pedido.observacoes)
    setTextoObs(textoLimpo)
  }

  async function handleSalvarObs(id: string, e?: React.MouseEvent | React.KeyboardEvent) {
    if (e) e.stopPropagation()
    setSalvandoObs(true)
    const ped = pedidos.find(p => p.id === id)
    const { numeroNc } = extrairNcDeObservacoes(ped?.observacoes)
    const obsFormatada = formatarObservacoesComNc(textoObs.trim() || null, numeroNc)
    const { error } = await atualizarObservacoesPedidoCompra(id, obsFormatada)
    setSalvandoObs(false)
    if (error) {
      alert(`Erro ao salvar observação: ${error}`)
      return
    }
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, observacoes: obsFormatada } : p))
    setEditandoObsId(null)
  }

  function handleCancelarEdicaoObs(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    setEditandoObsId(null)
    setTextoObs('')
  }

  async function carregar() {
    setLoading(true)
    setError(null)
    const [{ data: pedidosData, error: errP }, { data: ncsData }, { data: pregoesData }] = await Promise.all([
      getPedidosCompra(),
      getNotasCredito(),
      getPregoes(),
    ])
    setLoading(false)
    if (errP) { setError(errP); return }
    setPedidos(pedidosData ?? [])
    setNcs(ncsData ?? [])
    // Monta mapa numero_pregao e item_pregao_id → { objeto, nup, numero_pregao_atual }
    const pm = new Map<string, { objeto: string; nup: string | null; numero_pregao_atual: string }>()
    for (const p of (pregoesData ?? [])) {
      if (p.numero_pregao) pm.set(p.numero_pregao, { objeto: p.objeto ?? '', nup: p.nup ?? null, numero_pregao_atual: p.numero_pregao })
      if (p.itens) {
        for (const i of p.itens) {
          pm.set(i.id, { objeto: p.objeto ?? '', nup: p.nup ?? null, numero_pregao_atual: p.numero_pregao })
        }
      }
    }
    setPregaoMap(pm)
  }

  useEffect(() => { carregar() }, [])

  // Auto-expandir pedidos que têm resultados quando houver busca ativa
  useEffect(() => {
    if (busca.trim()) {
      const matchIds = new Set<string>()
      for (const p of pedidos) {
        const { matches } = pedidoMatchesBusca(p, pregaoMap, busca)
        if (matches) matchIds.add(p.id)
      }
      setExpandidos(matchIds)
    }
  }, [busca, pedidos, pregaoMap])

  // Filtra pedidos conforme a busca
  const { pedidosFiltrados, resultadoBuscaMap } = useMemo(() => {
    if (!busca.trim()) {
      return {
        pedidosFiltrados: pedidos,
        resultadoBuscaMap: new Map<string, { matchingItemIds: Set<string>; headerMatched: boolean }>(),
      }
    }
    const map = new Map<string, { matchingItemIds: Set<string>; headerMatched: boolean }>()
    const filtrados = pedidos.filter(p => {
      const res = pedidoMatchesBusca(p, pregaoMap, busca)
      if (res.matches) {
        map.set(p.id, res)
        return true
      }
      return false
    })
    return { pedidosFiltrados: filtrados, resultadoBuscaMap: map }
  }, [pedidos, pregaoMap, busca])

  async function handleStatus(id: string, status: StatusPedidoCompra) {
    setAtualizando(id + status)
    const { error } = await atualizarStatusPedidoCompra(id, status)
    setAtualizando(null)
    if (error) { alert(`Erro: ${error}`); return }
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    // Atualiza saldo das NCs globais se um pedido virar FINALIZADO ou ENTREGUE (ou deixar de ser)
    useNotasCreditoStore.getState().recalcStore()
  }

  async function handleDeletePedido(id: string) {
    setAtualizando('del-' + id)
    const { error } = await deletePedidoCompra(id)
    setAtualizando(null)
    setConfirmando(null)
    if (error) { alert(`Erro: ${error}`); return }
    setPedidos(prev => prev.filter(p => p.id !== id))
    setExpandidos(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    useNotasCreditoStore.getState().recalcStore()
  }

  async function handleDeleteItem(pedidoId: string, itemId: string) {
    setAtualizando('del-item-' + itemId)
    const pedidoAtual = pedidos.find(p => p.id === pedidoId)
    const novosItens = (pedidoAtual?.itens ?? []).filter(i => i.id !== itemId)
    const novoTotal = novosItens.reduce((acc, i) => acc + i.valor_total, 0)

    // Exclui item e atualiza automaticamente o pedido para 'RASCUNHO' (em aberto) com novo total
    const { error } = await deleteItemPedidoCompra(itemId, pedidoId, novoTotal)
    setAtualizando(null)
    setConfirmando(null)
    if (error) { alert(`Erro: ${error}`); return }
    setPedidos(prev => prev.map(p => {
      if (p.id !== pedidoId) return p
      return { ...p, itens: novosItens, valor_total: novoTotal, status: 'RASCUNHO' }
    }))
    useNotasCreditoStore.getState().recalcStore()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-surface-400">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-sm">Carregando pedidos...</span>
    </div>
  )

  if (error) return (
    <div className="card p-6 text-center space-y-3">
      <p className="text-red-400 text-sm">{error}</p>
      <button className="btn-secondary" onClick={carregar}>Tentar novamente</button>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-primary-400" />
          <h2 className="text-sm font-semibold text-surface-100">Pedidos de Compra</h2>
          <span className="badge bg-surface-700 text-surface-300 border border-surface-600 text-[10px]">
            {busca.trim() ? `${pedidosFiltrados.length} de ${pedidos.length}` : pedidos.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pedidosFiltrados.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (expandidos.size === pedidosFiltrados.length) {
                  setExpandidos(new Set())
                } else {
                  setExpandidos(new Set(pedidosFiltrados.map(p => p.id)))
                }
              }}
              className="text-xs text-surface-400 hover:text-surface-200 transition-colors px-2 py-1 rounded hover:bg-surface-800"
            >
              {expandidos.size === pedidosFiltrados.length && pedidosFiltrados.length > 0 ? 'Recolher todos' : 'Expandir todos'}
            </button>
          )}
          <button onClick={carregar} className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-xs">
            <RefreshCw size={12} /> Atualizar
          </button>
          <button
            onClick={() => setModalRelatorioAberto(true)}
            className="btn-primary !py-1.5 !px-3 flex items-center gap-1.5 text-xs shadow-sm hover:brightness-110 transition-all"
            title="Gerar relatório consolidado dos pedidos do ano com gráficos e relação por Subitem"
          >
            <BarChart3 size={13} /> Relatório Anual
          </button>
        </div>
      </div>

      {/* Barra de busca */}
      <div className="flex items-center gap-3 bg-surface-800 px-4 py-2.5 rounded-xl border border-surface-700/50 focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/20 transition-all shadow-sm">
        <Search size={16} className="text-surface-400 shrink-0" />
        <input
          type="text"
          className="input flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-xs text-surface-100 placeholder:text-surface-400"
          placeholder="Buscar por Item, PN, MPN, Pregão, Comp. Master, SI, Descrição, Empresa Ganhadora, CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="text-surface-400 hover:text-surface-200 transition-colors text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-700/50"
            title="Limpar busca"
          >
            <X size={13} />
            <span>Limpar</span>
          </button>
        )}
      </div>

      {pedidos.length === 0 && (
        <div className="card flex flex-col items-center justify-center h-64 gap-3 text-surface-400">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">Nenhum pedido registrado ainda.</p>
          <p className="text-xs text-surface-500">Use a aba Compras para criar seu primeiro pedido.</p>
        </div>
      )}

      {pedidos.length > 0 && pedidosFiltrados.length === 0 && busca.trim() && (
        <div className="card flex flex-col items-center justify-center h-48 gap-3 text-surface-400">
          <Search size={28} className="opacity-30" />
          <p className="text-sm">Nenhum pedido ou item encontrado para "{busca}".</p>
          <button onClick={() => setBusca('')} className="btn-secondary !py-1 !px-2.5 text-xs">
            Limpar busca
          </button>
        </div>
      )}

      <div className="space-y-2">
        {pedidosFiltrados.map(pedido => {
          const cfg = STATUS_CONFIG[pedido.status]
          const isOpen = expandidos.has(pedido.id)
          const qtdItens = pedido.itens?.length ?? 0
          const isDelPedido = confirmando === `pedido:${pedido.id}`
          const matchingItemIds = resultadoBuscaMap.get(pedido.id)?.matchingItemIds ?? new Set<string>()
          const temFiltroItens = busca.trim().length > 0 && matchingItemIds.size > 0
          const mostrarTodos = mostrarTodosItens[pedido.id] ?? false
          const itensParaExibir = (temFiltroItens && !mostrarTodos)
            ? (pedido.itens ?? []).filter(i => matchingItemIds.has(i.id))
            : (pedido.itens ?? [])

          return (
            <div key={pedido.id} className={cn('card overflow-hidden transition-all duration-200', isOpen && 'border-primary-500/30')}>

              {/* ── Cabeçalho da leva ─────────────────────────────────────── */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  className="shrink-0 text-surface-400 hover:text-surface-200 transition-colors"
                  onClick={() => toggleExpandido(pedido.id)}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {/* ── Pedido & SI com descrição completa ────────────────────── */}
                {(() => {
                  const sisDoPedido = getSisDoPedido(pedido)
                  const { numeroNc } = extrairNcDeObservacoes(pedido.observacoes)
                  return (
                    <div
                      className="shrink-0 min-w-[130px] max-w-[260px] cursor-pointer"
                      onClick={() => toggleExpandido(pedido.id)}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-[10px] text-surface-400 leading-none">Pedido</p>
                        {numeroNc && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-sky-950/70 text-sky-300 border border-sky-700/50"
                            title={`Atrelado à Nota de Crédito: ${numeroNc}`}
                          >
                            NC: {numeroNc}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-surface-100">#{String(pedido.numero).padStart(4, '0')}</p>
                      {sisDoPedido.length > 0 ? (
                        <div className="mt-0.5 space-y-0.5">
                          {sisDoPedido.map(txt => (
                            <p
                              key={txt}
                              className="text-[11px] font-semibold text-primary-300 truncate leading-tight"
                              title={txt}
                            >
                              {txt}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-surface-500 italic mt-0.5 leading-tight">Sem SI</p>
                      )}
                    </div>
                  )
                })()}

                <div className="shrink-0 w-36 cursor-pointer" onClick={() => toggleExpandido(pedido.id)}>
                  <p className="text-[10px] text-surface-400 leading-none mb-0.5">Data</p>
                  <p className="text-xs text-surface-200">{formatDate(pedido.criado_em)}</p>
                </div>

                <div className="shrink-0 w-14 text-center cursor-pointer" onClick={() => toggleExpandido(pedido.id)}>
                  <p className="text-[10px] text-surface-400 leading-none mb-0.5">Itens</p>
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-sm font-semibold text-surface-100">{qtdItens}</p>
                    {temFiltroItens && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-primary-900/60 text-primary-300 font-medium" title={`${matchingItemIds.size} correspondente(s)`}>
                        {matchingItemIds.size}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 w-32 text-right cursor-pointer" onClick={() => toggleExpandido(pedido.id)}>
                  <p className="text-[10px] text-surface-400 leading-none mb-0.5">Valor Total</p>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(pedido.valor_total)}</p>
                </div>

                {/* ── Observações do Pedido (Aproveitamento do espaço central) ── */}
                <div
                  className="flex-1 min-w-0 mx-2 px-3 py-1.5 rounded-lg border border-surface-700/40 bg-surface-900/40 hover:border-surface-600/60 transition-all flex items-center gap-2 group"
                  onClick={e => e.stopPropagation()}
                >
                  {editandoObsId === pedido.id ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        type="text"
                        autoFocus
                        value={textoObs}
                        onChange={e => setTextoObs(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSalvarObs(pedido.id, e)
                          if (e.key === 'Escape') handleCancelarEdicaoObs(e)
                        }}
                        placeholder="Adicionar observações do pedido..."
                        className="input !py-1 !px-2 text-xs flex-1 bg-surface-800 border-surface-600 focus:border-primary-500"
                        disabled={salvandoObs}
                      />
                      <button
                        type="button"
                        onClick={e => handleSalvarObs(pedido.id, e)}
                        disabled={salvandoObs}
                        className="p-1.5 rounded bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/50 transition-colors disabled:opacity-50 shrink-0"
                        title="Salvar (Enter)"
                      >
                        {salvandoObs ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelarEdicaoObs}
                        disabled={salvandoObs}
                        className="p-1.5 rounded bg-surface-700/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors shrink-0"
                        title="Cancelar (Esc)"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider shrink-0">Obs:</span>
                        {(() => {
                          const { textoLimpo } = extrairNcDeObservacoes(pedido.observacoes)
                          return textoLimpo ? (
                            <span
                              className="text-xs text-surface-200 truncate cursor-pointer hover:text-surface-100"
                              title={textoLimpo}
                              onClick={e => iniciarEdicaoObs(pedido, e)}
                            >
                              {textoLimpo}
                            </span>
                          ) : (
                            <span
                              className="text-xs text-surface-500 italic cursor-pointer hover:text-surface-400"
                              onClick={e => iniciarEdicaoObs(pedido, e)}
                            >
                              Sem observações
                            </span>
                          )
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={e => iniciarEdicaoObs(pedido, e)}
                        className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded text-surface-400 hover:text-primary-300 hover:bg-surface-700/60 border border-surface-700/50 hover:border-primary-500/40 transition-colors"
                        title={extrairNcDeObservacoes(pedido.observacoes).textoLimpo ? 'Editar observações' : 'Adicionar observações'}
                      >
                        <Pencil size={10} />
                        <span>{extrairNcDeObservacoes(pedido.observacoes).textoLimpo ? 'Editar' : 'Adicionar'}</span>
                      </button>
                    </div>
                  )}
                </div>

                <span className={cn('shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border', cfg.className)}>
                  {cfg.icon} {cfg.label}
                </span>

                {/* Ações de status */}
                {pedido.status === 'RASCUNHO' && !isDelPedido && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-amber-900/30 text-amber-300 border border-amber-700/40 hover:bg-amber-800/40 transition-colors disabled:opacity-50"
                      disabled={!!atualizando}
                      onClick={() => navigate('/compras', { state: { editarRascunho: pedido } })}
                      title="Voltar para a tela de compras mantendo os itens"
                    >
                      <FileEdit size={10} />
                      Continuar Comprando
                    </button>
                    <button
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-primary-900/30 text-primary-300 border border-primary-700/40 hover:bg-primary-800/40 transition-colors disabled:opacity-50"
                      disabled={!!atualizando}
                      onClick={() => handleStatus(pedido.id, 'FINALIZADO')}
                    >
                      {atualizando === pedido.id + 'FINALIZADO' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                      Finalizar
                    </button>
                    <button
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-red-900/30 text-red-300 border border-red-700/40 hover:bg-red-800/40 transition-colors disabled:opacity-50"
                      disabled={!!atualizando}
                      onClick={() => handleStatus(pedido.id, 'CANCELADO')}
                    >
                      {atualizando === pedido.id + 'CANCELADO' ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                      Cancelar
                    </button>
                  </div>
                )}
                {pedido.status === 'FINALIZADO' && !isDelPedido && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-emerald-900/30 text-emerald-300 border border-emerald-700/40 hover:bg-emerald-800/40 transition-colors disabled:opacity-50"
                      disabled={!!atualizando}
                      onClick={() => {
                        if (confirm('Tem certeza que deseja marcar este pedido como entregue? Ele deixará de constar nos "Pedidos Pendentes".')) {
                          handleStatus(pedido.id, 'ENTREGUE')
                        }
                      }}
                    >
                      {atualizando === pedido.id + 'ENTREGUE' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                      Marcar Entregue
                    </button>
                  </div>
                )}

                {/* Imprimir PDF */}
                {!isDelPedido && (
                  <>
                    <button
                      id={`btn-imprimir-${pedido.id}`}
                      title="Exportar PDF"
                      className="p-1.5 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-900/20 transition-colors"
                      onClick={() => imprimirPedidoPDF(pedido, ncs, pregaoMap)}
                    >
                      <Printer size={14} />
                    </button>
                    <button
                      id={`btn-espelho-${pedido.id}`}
                      title="Gerar Espelho (SPED)"
                      className="p-1.5 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-900/20 transition-colors"
                      onClick={() => setEspelhoPedido(pedido)}
                    >
                      <ClipboardList size={14} />
                    </button>
                  </>
                )}

                {/* Excluir pedido */}
                {!isDelPedido ? (
                  <button
                    id={`btn-excluir-pedido-${pedido.id}`}
                    title="Excluir pedido"
                    className="p-1.5 rounded-lg text-surface-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    disabled={!!atualizando}
                    onClick={() => setConfirmando(`pedido:${pedido.id}`)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-red-950/50 border border-red-700/50 rounded-lg px-2.5 py-1">
                    <AlertTriangle size={11} className="text-red-400 shrink-0" />
                    <span className="text-[10px] text-red-300">Excluir pedido e todos os itens?</span>
                    <button
                      className="text-[10px] font-semibold text-red-300 hover:text-red-100 transition-colors ml-1 disabled:opacity-50"
                      disabled={!!atualizando}
                      onClick={() => handleDeletePedido(pedido.id)}
                    >
                      {atualizando === 'del-' + pedido.id ? <Loader2 size={10} className="animate-spin inline" /> : 'Sim'}
                    </button>
                    <span className="text-surface-600">|</span>
                    <button className="text-[10px] text-surface-400 hover:text-surface-200" onClick={() => setConfirmando(null)}>Não</button>
                  </div>
                )}
              </div>

              {/* Observações */}
              {isOpen && pedido.observacoes && (
                <div className="px-4 py-2 bg-surface-700/20 border-t border-surface-600/30 text-xs text-surface-400">
                  <span className="font-medium text-surface-300">Obs:</span> {pedido.observacoes}
                </div>
              )}

              {/* ── Tabela de itens ──────────────────────────────────────── */}
              {isOpen && (
                <div className="border-t border-surface-600/30 overflow-x-auto">
                  {temFiltroItens && (
                    <div className="flex items-center justify-between px-4 py-2 bg-primary-950/40 border-b border-primary-500/20 text-xs text-primary-300">
                      <span className="flex items-center gap-1.5">
                        <Search size={13} className="text-primary-400" />
                        Mostrando <strong>{itensParaExibir.length}</strong> de <strong>{pedido.itens?.length ?? 0}</strong> itens correspondentes à busca
                      </span>
                      <button
                        type="button"
                        onClick={() => setMostrarTodosItens(prev => ({ ...prev, [pedido.id]: !mostrarTodos }))}
                        className="text-xs text-primary-300 hover:text-primary-100 underline underline-offset-2 ml-2 transition-colors cursor-pointer"
                      >
                        {mostrarTodos ? 'Filtrar apenas correspondentes' : 'Mostrar todos os itens deste pedido'}
                      </button>
                    </div>
                  )}

                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-surface-800 shadow-sm">
                      <tr className="bg-surface-700/40">
                        {['Comp. MASTER','Descrição (TR)','Descrição (Pregão)','PN / MPN','Pregão','Item','Vl. Unit.','Qtd','Vl. Total','CM','Empresa Ganhadora','CNPJ',''].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-surface-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-600/20">
                      {itensParaExibir.map(item => {
                        const isDelItem = confirmando === `item:${item.id}`
                        const isMatch = matchingItemIds.has(item.id)
                        return (
                          <tr key={item.id} className={cn('hover:bg-surface-700/20 transition-colors group', isMatch && busca.trim() && 'bg-primary-950/25')}>
                            <td className="px-3 py-2">
                              <p className="font-mono text-surface-200 text-[10px]">
                                {item.cd_comp_master.startsWith('UNMAPPED-') || item.cd_comp_master.startsWith('AVULSO-')
                                  ? <span className="text-surface-400 font-sans italic">Avulso (Pregão)</span>
                                  : item.cd_comp_master}
                              </p>
                              {item.nomenclatura && <p className="text-surface-400 text-[10px] truncate max-w-[140px]">{item.nomenclatura}</p>}
                            </td>
                            <td className="px-3 py-2 text-surface-300 max-w-[250px]">
                              <ItemDescTooltip
                                titulo={
                                  <span className="truncate block text-[10px]">
                                    {(item.descricao_tr || item.descricao_pregao) ?? '—'}
                                  </span>
                                }
                                descricaoCompleta={
                                  <ResumoTRTooltipContent
                                    texto={item.descricao_tr || item.descricao_pregao}
                                    numeroItem={item.numero_item}
                                  />
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-surface-300 max-w-[200px]">
                              <p className="truncate text-[10px]" title={item.descricao_pregao ?? undefined}>
                                {tituloDescricao(item.descricao_pregao)}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-surface-400 font-mono text-[10px]">
                              {[item.pn, item.mpn].filter(Boolean).join(' / ') || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px]">
                              {(() => {
                                const pInfo = item.item_pregao_id ? pregaoMap.get(item.item_pregao_id) : pregaoMap.get(item.numero_pregao ?? '')
                                const numPregao = pInfo?.numero_pregao_atual || item.numero_pregao || '—'
                                return (
                                  <>
                                    <p className="text-surface-300">{numPregao}</p>
                                    {pInfo?.nup && <p className="text-surface-500 text-[9px] mt-0.5">NUP: {pInfo.nup}</p>}
                                  </>
                                )
                              })()}
                            </td>
                            <td className="px-3 py-2 text-right text-surface-300">{item.numero_item ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-surface-200 font-mono">{formatCurrency(item.valor_unitario)}</td>
                            <td className="px-3 py-2 text-right text-surface-100 font-semibold">{Number(item.quantidade).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-semibold">{formatCurrency(item.valor_total)}</td>
                            <td className="px-3 py-2 text-center text-surface-300 font-mono text-[10px]">{item.cm ?? '—'}</td>
                            <td className="px-3 py-2">
                              {item.fornecedor_nome
                                ? <span className="flex items-center gap-1 text-surface-200"><Building2 size={10} className="text-surface-400 shrink-0" /><span className="truncate max-w-[140px]">{item.fornecedor_nome}</span></span>
                                : <span className="text-surface-500">—</span>}
                            </td>
                            <td className="px-3 py-2 text-surface-400 font-mono text-[10px] whitespace-nowrap">{formatCNPJ(item.fornecedor_cnpj)}</td>
                            <td className="px-2 py-2 text-right">
                              {!isDelItem ? (
                                <button
                                  title="Excluir item"
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-500 hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30"
                                  disabled={!!atualizando}
                                  onClick={() => setConfirmando(`item:${item.id}`)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              ) : (
                                <div className="flex items-center gap-1 justify-end">
                                  <span className="text-[9px] text-red-400">Excluir?</span>
                                  <button className="text-[9px] font-bold text-red-300 hover:text-red-100 disabled:opacity-50" disabled={!!atualizando} onClick={() => handleDeleteItem(pedido.id, item.id)}>
                                    {atualizando === 'del-item-' + item.id ? <Loader2 size={9} className="animate-spin inline" /> : 'Sim'}
                                  </button>
                                  <span className="text-surface-600 text-[9px]">|</span>
                                  <button className="text-[9px] text-surface-400 hover:text-surface-200" onClick={() => setConfirmando(null)}>Não</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-700/30 border-t border-surface-600/30">
                        <td colSpan={8} className="px-3 py-2 text-right text-xs font-semibold text-surface-300">
                          {temFiltroItens && !mostrarTodos ? 'Subtotal dos Itens Filtrados' : 'Total do Pedido'}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-emerald-400">
                          {formatCurrency(
                            temFiltroItens && !mostrarTodos
                              ? itensParaExibir.reduce((acc, i) => acc + i.valor_total, 0)
                              : pedido.valor_total
                          )}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {espelhoPedido && (
        <EspelhoModal
          pedido={espelhoPedido}
          ncs={ncs}
          pregaoMap={pregaoMap}
          onClose={() => setEspelhoPedido(null)}
        />
      )}

      {modalRelatorioAberto && (
        <RelatorioPedidosAnoModal
          pedidos={pedidos}
          ncs={ncs}
          onClose={() => setModalRelatorioAberto(false)}
        />
      )}
    </div>
  )
}
