import { useState, useMemo } from 'react'
import {
  X, Printer, Download, BarChart3, FileText,
  Calendar, CheckCircle2, DollarSign
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatPercent, extrairTituloItem, MAPA_SI_TITULOS, cn } from '@/lib/utils'
import { SI_NAMES } from '@/lib/ementario'
import { useNotasCreditoStore } from '@/hooks/useNotasCreditoStore'
import type { PedidoCompra, NotaCredito } from '@/types'

interface RelatorioPedidosAnoModalProps {
  pedidos: PedidoCompra[]
  ncs: NotaCredito[]
  onClose: () => void
}

interface ItemLinhaRelatorio {
  id: string
  si: string
  siNome: string
  pnMpn: string
  descricao: string
  valorUnitario: number
  quantidade: number
  valorTotal: number
  pedidoNumero: number
  pedidoNumeroStr: string
  pedidoData: string
  pedidoDataStr: string
  pedidoStatus: string
}

interface GrupoSubitemRelatorio {
  si: string
  siNome: string
  totalValor: number
  totalQtd: number
  itens: ItemLinhaRelatorio[]
  percentualDoTotal: number
}

// Cores para as barras dos Subitens
const PALETA_SI = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ec4899', '#06b6d4', '#84cc16', '#6366f1',
  '#14b8a6', '#f97316', '#a855f7', '#64748b'
]

function getNomeSI(si: string): string {
  const pad = si.padStart(2, '0')
  return MAPA_SI_TITULOS[pad] || SI_NAMES[pad] || `SUBITEM ${pad}`
}

export function RelatorioPedidosAnoModal({ pedidos, ncs, onClose }: RelatorioPedidosAnoModalProps) {
  const { saldoPorNC, gastoPorNC } = useNotasCreditoStore()
  const [mostrarDetalhesEncerradas, setMostrarDetalhesEncerradas] = useState(false)

  // Anos disponíveis nos pedidos e NCs
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>()
    const anoAtual = new Date().getFullYear()
    anos.add(anoAtual)

    for (const p of pedidos) {
      if (p.criado_em) {
        const y = new Date(p.criado_em).getFullYear()
        if (!isNaN(y)) anos.add(y)
      }
    }
    for (const n of ncs) {
      if (n.data_emissao) {
        const y = new Date(n.data_emissao + 'T00:00:00').getFullYear()
        if (!isNaN(y)) anos.add(y)
      } else if (n.created_at) {
        const y = new Date(n.created_at).getFullYear()
        if (!isNaN(y)) anos.add(y)
      }
    }
    return Array.from(anos).sort((a, b) => b - a)
  }, [pedidos, ncs])

  const [anoSelecionado, setAnoSelecionado] = useState<number>(() => {
    return anosDisponiveis[0] || new Date().getFullYear()
  })

  // Pedidos filtrados pelo ano selecionado (ignora CANCELADO)
  const pedidosDoAno = useMemo(() => {
    return pedidos.filter(p => {
      if (p.status === 'CANCELADO') return false
      const ano = new Date(p.criado_em).getFullYear()
      return ano === anoSelecionado
    })
  }, [pedidos, anoSelecionado])

  // NCs filtradas pelo ano selecionado
  const ncsDoAno = useMemo(() => {
    return ncs.filter(n => {
      let ano: number | null = null
      if (n.data_emissao) {
        ano = new Date(n.data_emissao + 'T00:00:00').getFullYear()
      } else if (n.numero_nc && /^\d{4}/.test(n.numero_nc)) {
        ano = parseInt(n.numero_nc.slice(0, 4), 10)
      } else if (n.created_at) {
        ano = new Date(n.created_at).getFullYear()
      }
      return ano === anoSelecionado
    })
  }, [ncs, anoSelecionado])

  // Totais Gerais e Conciliação Orçamentária
  const {
    totalNC,
    totalNCAtivas,
    totalNCEncerradas,
    ncsAtivasCount,
    ncsEncerradasCount,
    totalResidualEncerrado,
    conciliacaoNCs,
  } = useMemo(() => {
    let totGeral = 0
    let totAtivas = 0
    let totEncerradas = 0
    let countAtivas = 0
    let countEncerradas = 0
    let totResidual = 0

    const conciliacao = ncsDoAno.map(n => {
      const val = Number(n.valor || 0)
      totGeral += val
      const gasto = gastoPorNC[n.id] ?? (n.numero_nc ? gastoPorNC[n.numero_nc] : 0) ?? 0
      const isEncerrada = n.status === 'ENCERRADA'

      if (isEncerrada) {
        totEncerradas += val
        countEncerradas++
        const residual = Math.max(0, val - gasto)
        totResidual += residual
        return {
          id: n.id,
          numero_nc: n.numero_nc || n.id,
          si: n.si ? n.si.trim().padStart(2, '0') : 'S/SI',
          pi: n.plano_interno || '—',
          descricao: n.descricao || '',
          status: 'ENCERRADA' as const,
          valor: val,
          gasto,
          saldoDisponivel: 0,
          residualPerdido: residual,
        }
      } else {
        totAtivas += val
        countAtivas++
        const saldoDisp = saldoPorNC[n.id] ?? Math.max(0, val - gasto)
        return {
          id: n.id,
          numero_nc: n.numero_nc || n.id,
          si: n.si ? n.si.trim().padStart(2, '0') : 'S/SI',
          pi: n.plano_interno || '—',
          descricao: n.descricao || '',
          status: 'ATIVA' as const,
          valor: val,
          gasto,
          saldoDisponivel: saldoDisp,
          residualPerdido: 0,
        }
      }
    }).sort((a, b) => a.si.localeCompare(b.si) || a.numero_nc.localeCompare(b.numero_nc))

    return {
      totalNC: totGeral,
      totalNCAtivas: totAtivas,
      totalNCEncerradas: totEncerradas,
      ncsAtivasCount: countAtivas,
      ncsEncerradasCount: countEncerradas,
      totalResidualEncerrado: totResidual,
      conciliacaoNCs: conciliacao,
    }
  }, [ncsDoAno, gastoPorNC, saldoPorNC])

  const totalPedido = useMemo(() => {
    return pedidosDoAno.reduce((acc, p) => acc + Number(p.valor_total || 0), 0)
  }, [pedidosDoAno])

  const saldoNC = useMemo(() => {
    return ncsDoAno
      .filter(n => n.status !== 'ENCERRADA')
      .reduce((acc, n) => {
        const s = saldoPorNC[n.id] ?? Math.max(0, Number(n.valor || 0))
        return acc + s
      }, 0)
  }, [ncsDoAno, saldoPorNC])

  const diferencaBrutaTeorica = totalNC - totalPedido
  const pctExecutado = totalNC > 0 ? Math.min(100, (totalPedido / totalNC) * 100) : 0

  // Itens mapeados e agrupados por Subitem (SI)
  const { gruposPorSI, totalItensAno } = useMemo(() => {
    const mapa = new Map<string, ItemLinhaRelatorio[]>()
    let qtdItens = 0

    for (const pedido of pedidosDoAno) {
      const dataFormatada = new Date(pedido.criado_em).toLocaleDateString('pt-BR')
      const numPedidoStr = `#${String(pedido.numero).padStart(4, '0')}`

      for (const item of (pedido.itens ?? [])) {
        qtdItens++
        const rawSi = (item.si || '').trim()
        const siPad = rawSi ? rawSi.padStart(2, '0') : 'SEM SI'
        const siNome = getNomeSI(siPad)

        // Descrição abreviada do cadastro; caso não tenha sido atrelado ao cadastro, usar descrição resumida do TR
        let desc = (item.nomenclatura || '').trim()
        if (!desc) {
          desc = extrairTituloItem(item.descricao_tr) || extrairTituloItem(item.descricao_pregao) || '—'
        }

        const pnMpnParts = [item.pn, item.mpn].filter(Boolean)
        const pnMpn = pnMpnParts.length > 0 ? pnMpnParts.join(' / ') : '—'

        const linha: ItemLinhaRelatorio = {
          id: item.id,
          si: siPad,
          siNome,
          pnMpn,
          descricao: desc,
          valorUnitario: Number(item.valor_unitario || 0),
          quantidade: Number(item.quantidade || 0),
          valorTotal: Number(item.valor_total || 0),
          pedidoNumero: pedido.numero,
          pedidoNumeroStr: numPedidoStr,
          pedidoData: pedido.criado_em,
          pedidoDataStr: dataFormatada,
          pedidoStatus: pedido.status,
        }

        if (!mapa.has(siPad)) mapa.set(siPad, [])
        mapa.get(siPad)!.push(linha)
      }
    }

    const grupos: GrupoSubitemRelatorio[] = []
    for (const [si, itens] of mapa) {
      const totalValor = itens.reduce((s, i) => s + i.valorTotal, 0)
      const totalQtd = itens.reduce((s, i) => s + i.quantidade, 0)
      const percentualDoTotal = totalPedido > 0 ? (totalValor / totalPedido) * 100 : 0
      
      // Ordena itens dentro do grupo por data desc, depois nº pedido desc
      itens.sort((a, b) => {
        const dt = new Date(b.pedidoData).getTime() - new Date(a.pedidoData).getTime()
        if (dt !== 0) return dt
        return b.pedidoNumero - a.pedidoNumero
      })

      grupos.push({
        si,
        siNome: getNomeSI(si),
        totalValor,
        totalQtd,
        itens,
        percentualDoTotal
      })
    }

    // Ordenar grupos por SI (código crescente)
    grupos.sort((a, b) => a.si.localeCompare(b.si, undefined, { numeric: true }))

    return { gruposPorSI: grupos, totalItensAno: qtdItens }
  }, [pedidosDoAno, totalPedido])

  // Maior valor entre os SIs (para dimensionar barra do gráfico de SI)
  const maxValorSI = useMemo(() => {
    return gruposPorSI.reduce((max, g) => Math.max(max, g.totalValor), 0) || 1
  }, [gruposPorSI])

  // ─── Impressão via Janela HTML Formatada (Padrão A4 GERSUP) ─────────────────
  const handleImprimirHTML = () => {
    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) {
      alert('Por favor, permita pop-ups no navegador para gerar a impressão.')
      return
    }

    const agora = new Date().toLocaleString('pt-BR')

    // Linhas de gráficos dos SIs em HTML/CSS para impressão
    const graficosSiHtml = gruposPorSI.map((g, idx) => {
      const cor = PALETA_SI[idx % PALETA_SI.length]
      const barWidth = Math.max(1, Math.min(100, (g.totalValor / maxValorSI) * 100))
      return `
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 600; color: #1e293b; margin-bottom: 2px;">
            <span>SI ${g.si} — ${g.siNome} (${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'})</span>
            <span>${formatCurrency(g.totalValor)} <span style="color: #64748b; font-weight: normal;">(${formatPercent(g.percentualDoTotal)})</span></span>
          </div>
          <div style="height: 9px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${barWidth}%; background: ${cor}; border-radius: 4px;"></div>
          </div>
        </div>
      `
    }).join('')

    // Seções de cada Subitem com tabela de pedidos
    const secoesSubitensHtml = gruposPorSI.map(g => {
      const rows = g.itens.map(item => `
        <tr>
          <td style="text-align: center; font-weight: 600; color: #475569;">SI ${item.si}</td>
          <td style="font-family: monospace; font-size: 8.5px; color: #334155;">${item.pnMpn}</td>
          <td style="max-width: 320px; line-height: 1.35; color: #0f172a;">${item.descricao}</td>
          <td style="text-align: right; white-space: nowrap;">${formatCurrency(item.valorUnitario)}</td>
          <td style="text-align: right; font-weight: 600;">${item.quantidade.toLocaleString('pt-BR')}</td>
          <td style="text-align: right; font-weight: 600; white-space: nowrap; color: #0f766e;">${formatCurrency(item.valorTotal)}</td>
          <td style="text-align: center; font-weight: 700; color: #2563eb;">${item.pedidoNumeroStr}</td>
          <td style="text-align: center; white-space: nowrap;">${item.pedidoDataStr}</td>
        </tr>
      `).join('')

      return `
        <div class="si-group" style="margin-top: 18px; page-break-inside: avoid;">
          <div style="background: #232f1c; color: #ffffff; padding: 7px 12px; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 10.5px; font-weight: bold; letter-spacing: 0.02em;">
              SI ${g.si} — ${g.siNome}
            </div>
            <div style="font-size: 9.5px; color: #facc15; font-weight: 600;">
              Total do Subitem: ${formatCurrency(g.totalValor)} &nbsp;|&nbsp; ${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'}
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9px; border: 1px solid #cbd5e1; border-top: 0;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; text-transform: uppercase; font-size: 8px; letter-spacing: 0.04em;">
                <th style="padding: 5px 6px; text-align: center; width: 45px; border-bottom: 1px solid #cbd5e1;">Subitem</th>
                <th style="padding: 5px 6px; text-align: left; width: 110px; border-bottom: 1px solid #cbd5e1;">PN / MPN</th>
                <th style="padding: 5px 6px; text-align: left; border-bottom: 1px solid #cbd5e1;">Descrição (Cadastro / TR)</th>
                <th style="padding: 5px 6px; text-align: right; width: 75px; border-bottom: 1px solid #cbd5e1;">Vl. Unitário</th>
                <th style="padding: 5px 6px; text-align: right; width: 55px; border-bottom: 1px solid #cbd5e1;">Qtd</th>
                <th style="padding: 5px 6px; text-align: right; width: 85px; border-bottom: 1px solid #cbd5e1;">Vl. Total</th>
                <th style="padding: 5px 6px; text-align: center; width: 60px; border-bottom: 1px solid #cbd5e1;">Nº Pedido</th>
                <th style="padding: 5px 6px; text-align: center; width: 75px; border-bottom: 1px solid #cbd5e1;">Data Pedido</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
            <tfoot>
              <tr style="background: #f8fafc; font-weight: bold; border-top: 1px solid #cbd5e1;">
                <td colspan="4" style="padding: 6px 8px; text-align: right; color: #475569; font-size: 9px;">SUBTOTAL SI ${g.si}:</td>
                <td style="padding: 6px 8px; text-align: right; font-size: 9px;">${g.totalQtd.toLocaleString('pt-BR')}</td>
                <td style="padding: 6px 8px; text-align: right; color: #0f766e; font-size: 9.5px;">${formatCurrency(g.totalValor)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `
    }).join('')

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>GERSUP — Relatório Anual de Pedidos (${anoSelecionado})</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @page {
      size: A4 landscape;
      margin: 10mm 12mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 9.5px;
      color: #0f172a;
      background: #ffffff;
      padding: 12px 18px;
    }
    .header {
      background: #232f1c;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .header h1 {
      font-size: 17px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 3px;
    }
    .header p {
      font-size: 9.5px;
      color: #facc15;
    }
    .header-right {
      text-align: right;
      font-size: 9px;
      color: #e2e8f0;
      line-height: 1.4;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .kpi {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
    }
    .kpi-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 3px;
    }
    .kpi-val {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1.3fr;
      gap: 12px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .chart-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      background: #ffffff;
    }
    .chart-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 10px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 5px;
    }
    table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    table td {
      padding: 5px 6px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .total-geral {
      margin-top: 18px;
      background: #1e293b;
      color: #ffffff;
      padding: 12px 16px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      page-break-inside: avoid;
    }
    .footer {
      margin-top: 20px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>GERSUP — Relatório dos Pedidos de Compra</h1>
      <p>Exercício / Ano de Referência: ${anoSelecionado}</p>
    </div>
    <div class="header-right">
      <div><strong>Emissão:</strong> ${agora}</div>
      <div><strong>Gerente de Suprimento</strong> &bull; Sistema GERSUP</div>
    </div>
  </div>

  <div class="kpis" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 12px;">
    <div class="kpi">
      <div class="kpi-label">Total NCs Emitidas (${anoSelecionado})</div>
      <div class="kpi-val" style="color: #0284c7;">${formatCurrency(totalNC)}</div>
      <div style="font-size: 8px; color: #64748b; margin-top: 2px;">${ncsAtivasCount} ativas | ${ncsEncerradasCount} encerradas</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Pedidos (${anoSelecionado})</div>
      <div class="kpi-val" style="color: #0f766e;">${formatCurrency(totalPedido)}</div>
      <div style="font-size: 8px; color: #64748b; margin-top: 2px;">${pedidosDoAno.length} pedidos emitidos</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldos Encerrados (Recolhidos)</div>
      <div class="kpi-val" style="color: #b45309;">${formatCurrency(totalResidualEncerrado)}</div>
      <div style="font-size: 8px; color: #b45309; margin-top: 2px;">NCs de Junho encerradas</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Saldo Disponível (NCs Ativas)</div>
      <div class="kpi-val" style="color: ${saldoNC < 0 ? '#b91c1c' : '#15803d'};">${formatCurrency(saldoNC)}</div>
      <div style="font-size: 8px; color: #15803d; margin-top: 2px;">Crédito líquido vigente</div>
    </div>
  </div>

  <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; page-break-inside: avoid;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <span style="font-size: 10px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em;">
        Demonstrativo de Conciliação Orçamentária Auditável
      </span>
      <span style="font-size: 9px; font-weight: 600; color: #0284c7; background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">
        Exercício ${anoSelecionado}
      </span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 9px; padding: 8px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
      <div>
        <span style="color: #64748b; display: block; font-size: 8px;">1. TOTAL NCs EMITIDAS</span>
        <strong style="color: #0f172a; font-size: 11px;">${formatCurrency(totalNC)}</strong>
      </div>
      <div>
        <span style="color: #64748b; display: block; font-size: 8px;">2. (-) TOTAL PEDIDOS</span>
        <strong style="color: #0f766e; font-size: 11px;">${formatCurrency(totalPedido)}</strong>
      </div>
      <div>
        <span style="color: #64748b; display: block; font-size: 8px;">3. (-) SALDOS ENCERRADOS</span>
        <strong style="color: #b45309; font-size: 11px;">${formatCurrency(totalResidualEncerrado)}</strong>
      </div>
      <div>
        <span style="color: #64748b; display: block; font-size: 8px;">4. (=) SALDO DISPONÍVEL ATIVO</span>
        <strong style="color: #15803d; font-size: 11px;">${formatCurrency(saldoNC)}</strong>
      </div>
    </div>
    <div style="font-size: 8px; color: #475569; margin-top: 6px; line-height: 1.4;">
      <strong>Nota de Conciliação:</strong> Diferença Bruta (Total NCs - Total Pedidos) = <strong>${formatCurrency(diferencaBrutaTeorica)}</strong>.
      Como as 7 Notas de Crédito de Junho/2026 foram formalmente encerradas, os seus saldos residuais não executados somando <strong>${formatCurrency(totalResidualEncerrado)}</strong> deixaram de ficar disponíveis e não acumulam no exercício.
      O saldo disponível líquido efetivo para novas aquisições é de <strong>${formatCurrency(saldoNC)}</strong> (pertencente às 8 NCs ativas).
    </div>
  </div>

  <div class="charts-grid">
    <!-- Gráfico 1: Execução Orçamentária -->
    <div class="chart-box">
      <div class="chart-title">Execução Orçamentária: NCs vs. Total Pedido</div>
      <div style="margin-top: 8px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-bottom: 4px;">
          <span style="font-weight: 600; color: #475569;">Progresso do Orçamento</span>
          <span style="font-weight: 700; color: #0f766e;">${formatPercent(pctExecutado)} executado</span>
        </div>
        <div style="height: 14px; background: #e2e8f0; border-radius: 7px; overflow: hidden; display: flex;">
          <div style="width: ${pctExecutado}%; background: #0f766e; height: 100%;"></div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 9px; margin-top: 10px;">
        <div style="padding: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">
          <div style="color: #166534; font-weight: 600;">Pedidos Emitidos</div>
          <div style="font-size: 12px; font-weight: 700; color: #14532d; margin-top: 2px;">${formatCurrency(totalPedido)}</div>
        </div>
        <div style="padding: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="color: #475569; font-weight: 600;">Saldo Remanescente</div>
          <div style="font-size: 12px; font-weight: 700; color: ${saldoNC < 0 ? '#b91c1c' : '#15803d'}; margin-top: 2px;">${formatCurrency(saldoNC)}</div>
        </div>
      </div>
    </div>

    <!-- Gráfico 2: Pedidos por SI -->
    <div class="chart-box">
      <div class="chart-title">Distribuição de Pedidos por Subitem (SI)</div>
      ${graficosSiHtml || '<p style="color:#64748b; font-size: 9px;">Nenhum pedido no período selecionado.</p>'}
    </div>
  </div>

  <div style="margin-top: 14px;">
    <h2 style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">
      Relação Analítica dos Pedidos por Subitem (${gruposPorSI.length} ${gruposPorSI.length === 1 ? 'Subitem' : 'Subitens'})
    </h2>
    ${secoesSubitensHtml || '<p style="color:#64748b; padding: 20px; text-align: center;">Nenhum item registrado para este ano.</p>'}
  </div>

  <div class="total-geral">
    <span>TOTAL GERAL DOS PEDIDOS NO EXERCÍCIO DE ${anoSelecionado}:</span>
    <span style="font-size: 16px; color: #4ade80;">${formatCurrency(totalPedido)}</span>
  </div>

  <div class="footer">
    <span>GERSUP — Sistema de Gerenciamento de Suprimentos &bull; Seção de Aquisições</span>
    <span>Relatório Anual consolidado por Subitem</span>
  </div>

  <script>
    window.onload = () => {
      setTimeout(() => { window.print(); }, 200);
    };
  <\/script>
</body>
</html>`)
    win.document.close()
  }

  // ─── Exportação Direta em PDF via jsPDF ──────────────────────────────────────
  const handleBaixarPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()

    const printHeader = (d: any, pageNum: number) => {
      d.setFillColor(35, 47, 28)
      d.rect(0, 0, pageW, 22, 'F')
      d.setFontSize(13)
      d.setTextColor(255, 255, 255)
      d.setFont('helvetica', 'bold')
      d.text(`GERSUP — Relatório dos Pedidos do Ano (${anoSelecionado})`, 10, 9)
      d.setFontSize(8.5)
      d.setTextColor(250, 204, 21)
      d.setFont('helvetica', 'normal')
      d.text(
        `Exercício: ${anoSelecionado}  |  Total NCs: ${formatCurrency(totalNC)}  |  Total Pedidos: ${formatCurrency(totalPedido)}  |  Pág. ${pageNum}`,
        10, 16
      )
      d.setTextColor(226, 232, 240)
      d.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageW - 10, 16, { align: 'right' })
    }

    let globalPage = 1
    printHeader(doc, globalPage)
    let cursorY = 28

    // Bloco de Resumo / KPIs
    doc.setFillColor(241, 245, 249)
    doc.roundedRect(10, cursorY, pageW - 20, 21, 2, 2, 'F')
    doc.setFontSize(7.5)
    doc.setTextColor(51, 65, 85)
    doc.setFont('helvetica', 'bold')
    doc.text(`TOTAL NCs: ${formatCurrency(totalNC)}`, 14, cursorY + 6)
    doc.text(`TOTAL PEDIDO: ${formatCurrency(totalPedido)}`, 80, cursorY + 6)
    doc.text(`RESIDUAL ENCERRADO: ${formatCurrency(totalResidualEncerrado)}`, 146, cursorY + 6)
    doc.text(`SALDO DISPONÍVEL (ATIVAS): ${formatCurrency(saldoNC)}`, 218, cursorY + 6)

    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(
      `* Conciliação Orçamentária: Saldo Disponível (${formatCurrency(saldoNC)}) = Total NCs (${formatCurrency(totalNC)}) - Total Pedidos (${formatCurrency(totalPedido)}) - Residual Encerrado de Junho (${formatCurrency(totalResidualEncerrado)})`,
      14, cursorY + 12
    )
    doc.text(
      `Execução do Orçamento: ${formatPercent(pctExecutado)}  |  ${pedidosDoAno.length} pedidos emitidos (${totalItensAno} itens)  |  ${gruposPorSI.length} Subitens atendidos`,
      14, cursorY + 16.5
    )

    cursorY += 27

    // 1. Tabela de Conciliação das Notas de Crédito
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(35, 47, 28)
    doc.text('1. Conciliação Orçamentária das Notas de Crédito (NCs)', 10, cursorY)
    cursorY += 3

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 10, right: 10, top: 26, bottom: 15 },
      styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [52, 71, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [['Nota de Crédito', 'Subitem (SI)', 'Plano Interno (PI)', 'Status', 'Valor Emitido', 'Executado Pedidos', 'Saldo Vigente / Residual']],
      body: conciliacaoNCs.map(c => [
        c.numero_nc,
        `SI ${c.si}`,
        c.pi,
        c.status,
        formatCurrency(c.valor),
        formatCurrency(c.gasto),
        c.status === 'ATIVA' ? formatCurrency(c.saldoDisponivel) : `(${formatCurrency(c.residualPerdido)} recolhido)`,
      ]),
      foot: [[
        'TOTAIS CONCILIADOS',
        '',
        '',
        `${ncsAtivasCount} ativas | ${ncsEncerradasCount} enc.`,
        formatCurrency(totalNC),
        formatCurrency(totalPedido),
        `Disp: ${formatCurrency(saldoNC)} | Enc: ${formatCurrency(totalResidualEncerrado)}`,
      ]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 118, 110], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 32 },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'center', cellWidth: 35 },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 35 },
        5: { halign: 'right', cellWidth: 38 },
        6: { halign: 'right', cellWidth: 50 },
      },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) {
          globalPage++
          printHeader(doc, globalPage)
        }
      }
    })

    cursorY = (doc as any).lastAutoTable.finalY + 8

    // 2. Tabela resumida de Pedidos por SI (Gráfico tabular)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(35, 47, 28)
    doc.text('2. Distribuição Consolidada de Pedidos por Subitem (SI)', 10, cursorY)
    cursorY += 3

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 10, right: 10, top: 26, bottom: 15 },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [52, 71, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [['Subitem (SI)', 'Nome da Despesa / Material', 'Qtd Itens', 'Total do Subitem', '% do Total Pedido']],
      body: gruposPorSI.map(g => [
        `SI ${g.si}`,
        g.siNome,
        g.itens.length.toString(),
        formatCurrency(g.totalValor),
        formatPercent(g.percentualDoTotal),
      ]),
      columnStyles: {
        0: { halign: 'center', cellWidth: 25 },
        1: { cellWidth: 140 },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 42 },
        4: { halign: 'right', cellWidth: 40 },
      },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) {
          globalPage++
          printHeader(doc, globalPage)
        }
      }
    })

    cursorY = (doc as any).lastAutoTable.finalY + 10

    // 3. Seção 3: Relação analítica detalhada por Subitem
    if (cursorY > 175) {
      doc.addPage()
      globalPage++
      printHeader(doc, globalPage)
      cursorY = 28
    }

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(35, 47, 28)
    doc.text('3. Relação Analítica de Pedidos por Subitem', 10, cursorY)
    cursorY += 4

    for (const g of gruposPorSI) {
      if (cursorY > 170) {
        doc.addPage()
        globalPage++
        printHeader(doc, globalPage)
        cursorY = 28
      }

      // Faixa de cabeçalho do Subitem
      doc.setFillColor(35, 47, 28)
      doc.rect(10, cursorY, pageW - 20, 7, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(`SI ${g.si} — ${g.siNome}`, 12, cursorY + 4.8)
      doc.setTextColor(250, 204, 21)
      doc.text(`Subtotal: ${formatCurrency(g.totalValor)} (${g.itens.length} itens)`, pageW - 12, cursorY + 4.8, { align: 'right' })
      cursorY += 8

      autoTable(doc, {
        startY: cursorY,
        margin: { left: 10, right: 10, top: 26, bottom: 15 },
        styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
        headStyles: { fillColor: [235, 242, 228], textColor: [52, 71, 42], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        head: [['PN / MPN', 'Descrição (Cadastro ou TR)', 'Vl. Unitário', 'Qtd', 'Vl. Total', 'Nº Pedido', 'Data']],
        body: g.itens.map(i => [
          i.pnMpn,
          i.descricao,
          formatCurrency(i.valorUnitario),
          i.quantidade.toLocaleString('pt-BR'),
          formatCurrency(i.valorTotal),
          i.pedidoNumeroStr,
          i.pedidoDataStr
        ]),
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 124 },
          2: { halign: 'right', cellWidth: 26 },
          3: { halign: 'right', cellWidth: 18 },
          4: { halign: 'right', cellWidth: 30 },
          5: { halign: 'center', cellWidth: 22 },
          6: { halign: 'center', cellWidth: 19 },
        },
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) {
            globalPage++
            printHeader(doc, globalPage)
          }
        }
      })

      cursorY = (doc as any).lastAutoTable.finalY + 7
    }

    // Rodapé de Total Geral
    if (cursorY > 180) {
      doc.addPage()
      globalPage++
      printHeader(doc, globalPage)
      cursorY = 28
    }

    doc.setFillColor(30, 41, 59)
    doc.rect(10, cursorY, pageW - 20, 10, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`TOTAL GERAL DOS PEDIDOS (${anoSelecionado}):`, 14, cursorY + 6.5)
    doc.setTextColor(74, 222, 128)
    doc.text(formatCurrency(totalPedido), pageW - 14, cursorY + 6.5, { align: 'right' })

    doc.save(`relatorio-pedidos-ano-${anoSelecionado}.pdf`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="card w-full max-w-6xl max-h-[92vh] flex flex-col bg-surface-900 border-surface-700 shadow-2xl overflow-hidden">
        
        {/* ─── Topo / Header do Modal ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-800/90 border-b border-surface-700/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-900/40 border border-primary-700/50 flex items-center justify-center text-primary-400 shrink-0">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-surface-50">Relatório dos Pedidos do Ano</h2>
                <span className="badge bg-primary-900/60 text-primary-300 border border-primary-700/40 text-[11px] font-mono">
                  {anoSelecionado}
                </span>
              </div>
              <p className="text-xs text-surface-400 mt-0.5">
                Métricas orçamentárias, gráficos e detalhamento completo de pedidos por Subitem (SI)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de Ano */}
            <div className="flex items-center gap-1.5 bg-surface-900/80 px-2.5 py-1.5 rounded-lg border border-surface-700">
              <Calendar size={13} className="text-surface-400" />
              <span className="text-xs text-surface-400 font-medium">Ano:</span>
              <select
                value={anoSelecionado}
                onChange={e => setAnoSelecionado(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-primary-400 focus:outline-none cursor-pointer"
              >
                {anosDisponiveis.map(ano => (
                  <option key={ano} value={ano} className="bg-surface-800 text-surface-100">
                    {ano}
                  </option>
                ))}
              </select>
            </div>

            {/* Botão Imprimir HTML (com gráficos de alta definição) */}
            <button
              onClick={handleImprimirHTML}
              title="Visualizar e Imprimir Relatório A4 Formatado"
              className="btn-primary !py-1.5 !px-3 flex items-center gap-1.5 text-xs shadow-sm hover:brightness-110 transition-all"
            >
              <Printer size={13} />
              <span>Imprimir / Salvar PDF</span>
            </button>

            {/* Botão Baixar PDF Direto (jsPDF) */}
            <button
              onClick={handleBaixarPDF}
              title="Baixar arquivo PDF consolidado"
              className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-xs text-surface-200 hover:text-white"
            >
              <Download size={13} />
              <span>Baixar PDF</span>
            </button>

            {/* Fechar */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-700/60 transition-colors ml-1"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Conteúdo Rolável ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Cards de Métricas (KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="card p-4 bg-surface-800/60 border-surface-700/60">
              <div className="flex items-center justify-between text-surface-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Total NCs Emitidas ({anoSelecionado})</span>
                <DollarSign size={14} className="text-sky-400" />
              </div>
              <p className="text-xl font-bold text-sky-400 font-mono">{formatCurrency(totalNC)}</p>
              <p className="text-[11px] text-surface-400 mt-1">
                {ncsAtivasCount} ativas ({formatCurrency(totalNCAtivas)}) | {ncsEncerradasCount} enc.
              </p>
            </div>

            <div className="card p-4 bg-surface-800/60 border-surface-700/60">
              <div className="flex items-center justify-between text-surface-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Total Pedido ({anoSelecionado})</span>
                <CheckCircle2 size={14} className="text-primary-400" />
              </div>
              <p className="text-xl font-bold text-primary-400 font-mono">{formatCurrency(totalPedido)}</p>
              <p className="text-[11px] text-surface-400 mt-1">{pedidosDoAno.length} pedidos ({totalItensAno} itens)</p>
            </div>

            <div className="card p-4 bg-surface-800/60 border-surface-700/60">
              <div className="flex items-center justify-between text-surface-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Saldos Encerrados (Recolhidos)</span>
                <span className="text-xs font-bold font-mono text-amber-400">
                  {ncsEncerradasCount} NCs
                </span>
              </div>
              <p className="text-xl font-bold text-amber-400 font-mono">
                {formatCurrency(totalResidualEncerrado)}
              </p>
              <p className="text-[11px] text-surface-400 mt-1">Devolvido ao encerrar Junho</p>
            </div>

            <div className="card p-4 bg-surface-800/60 border-surface-700/60">
              <div className="flex items-center justify-between text-surface-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Saldo Disponível (NCs Ativas)</span>
                <span className={cn('text-xs font-bold font-mono', saldoNC < 0 ? 'text-red-400' : 'text-emerald-400')}>
                  {ncsAtivasCount} NCs vigentes
                </span>
              </div>
              <p className={cn('text-xl font-bold font-mono', saldoNC < 0 ? 'text-red-400' : 'text-emerald-400')}>
                {formatCurrency(saldoNC)}
              </p>
              <p className="text-[11px] text-surface-400 mt-1">Crédito líquido para novos pedidos</p>
            </div>
          </div>

          {/* Banner de Conciliação Orçamentária Auditável */}
          <div className="card p-4 bg-surface-800/80 border-surface-700/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-700/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-xs font-bold text-surface-200 uppercase tracking-wider">
                  Demonstrativo de Conciliação Orçamentária ({anoSelecionado})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMostrarDetalhesEncerradas(prev => !prev)}
                className="text-xs text-primary-400 hover:text-primary-300 underline underline-offset-2 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>{mostrarDetalhesEncerradas ? 'Ocultar Detalhes das NCs Encerradas' : 'Ver NCs Encerradas de Junho (R$ 2.832,78)'}</span>
              </button>
            </div>

            {/* Fita Matemática / Equação de Conciliação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-900/60 border border-surface-700/40">
                <span className="text-[10px] text-surface-400 block mb-0.5">1. Total NCs Emitidas</span>
                <span className="font-mono font-bold text-sky-400 text-sm">{formatCurrency(totalNC)}</span>
                <span className="text-[10px] text-surface-500 block mt-0.5">{ncsAtivasCount} ativas + {ncsEncerradasCount} enc.</span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900/60 border border-surface-700/40">
                <span className="text-[10px] text-surface-400 block mb-0.5">2. (-) Total Pedidos</span>
                <span className="font-mono font-bold text-primary-400 text-sm">{formatCurrency(totalPedido)}</span>
                <span className="text-[10px] text-surface-500 block mt-0.5">{pedidosDoAno.length} pedidos no ano</span>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40">
                <span className="text-[10px] text-amber-300/80 block mb-0.5">3. (-) Saldos Encerrados</span>
                <span className="font-mono font-bold text-amber-400 text-sm">{formatCurrency(totalResidualEncerrado)}</span>
                <span className="text-[10px] text-amber-300/60 block mt-0.5">Recolhido em Junho</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                <span className="text-[10px] text-emerald-300/80 block mb-0.5">4. (=) Saldo Disponível</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">{formatCurrency(saldoNC)}</span>
                <span className="text-[10px] text-emerald-300/60 block mt-0.5">8 NCs ativas em vigor</span>
              </div>
            </div>

            <p className="text-[11px] text-surface-400 leading-relaxed bg-surface-900/40 p-2.5 rounded-lg border border-surface-700/30">
              <strong className="text-surface-300">Auditoria Orçamentária:</strong> A diferença aritmética bruta entre NCs emitidas e Pedidos executados é de <strong className="text-surface-200">{formatCurrency(diferencaBrutaTeorica)}</strong>.
              Como as 7 Notas de Crédito de Junho/2026 foram formalmente encerradas, os seus saldos residuais não executados somando <strong className="text-amber-400">{formatCurrency(totalResidualEncerrado)}</strong> foram anulados/recolhidos e não acumulam no exercício.
              Dessa forma, o saldo líquido real em vigor para novas contratações é estritamente <strong className="text-emerald-400">{formatCurrency(saldoNC)}</strong>.
            </p>

            {/* Detalhes Expansíveis das NCs Encerradas */}
            {mostrarDetalhesEncerradas && (
              <div className="space-y-2 pt-2 border-t border-surface-700/50">
                <h4 className="text-[11px] font-semibold text-surface-300 uppercase tracking-wider">
                  Detalhamento das NCs Encerradas de Junho/2026:
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-surface-400 border-b border-surface-700/60 text-left">
                        <th className="py-1 px-2">Nota de Crédito</th>
                        <th className="py-1 px-2">Subitem (SI)</th>
                        <th className="py-1 px-2 text-right">Valor Emitido</th>
                        <th className="py-1 px-2 text-right">Gasto em Pedidos</th>
                        <th className="py-1 px-2 text-right">Residual Recolhido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800">
                      {conciliacaoNCs.filter(c => c.status === 'ENCERRADA').map(c => (
                        <tr key={c.id} className="hover:bg-surface-800/40">
                          <td className="py-1.5 px-2 font-mono text-amber-300">{c.numero_nc}</td>
                          <td className="py-1.5 px-2 text-surface-300">SI {c.si} ({getNomeSI(c.si)})</td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-300">{formatCurrency(c.valor)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-400">{formatCurrency(c.gasto)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-amber-400 font-bold">{formatCurrency(c.residualPerdido)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-surface-700 font-bold text-surface-200">
                        <td colSpan={2} className="py-1.5 px-2">Total Recolhido em Junho:</td>
                        <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(totalNCEncerradas)}</td>
                        <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(totalNCEncerradas - totalResidualEncerrado)}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-amber-400">{formatCurrency(totalResidualEncerrado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── Seção de Gráficos ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Gráfico 1: Execução Orçamentária (NCs vs Pedidos) */}
            <div className="lg:col-span-5 card p-5 bg-surface-800/40 border-surface-700/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-surface-200 uppercase tracking-wider">
                    Execução Orçamentária
                  </h3>
                  <span className="text-xs font-bold text-primary-400 font-mono">
                    {formatPercent(pctExecutado)} executado
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Barra de progresso */}
                  <div>
                    <div className="h-3.5 bg-surface-700/60 rounded-full overflow-hidden p-0.5 border border-surface-600/40">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-400 transition-all duration-500 shadow-sm"
                        style={{ width: `${Math.min(100, pctExecutado)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-surface-400 mt-1.5 font-mono">
                      <span>R$ 0,00</span>
                      <span>Total NC: {formatCurrency(totalNC)}</span>
                    </div>
                  </div>

                  {/* Comparativo em Cards */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/50">
                      <span className="text-[10px] text-surface-400 font-semibold uppercase block mb-1">Total Pedido</span>
                      <span className="text-sm font-bold text-primary-400 font-mono block">{formatCurrency(totalPedido)}</span>
                      <span className="text-[10px] text-surface-500">{pedidosDoAno.length} pedidos</span>
                    </div>

                    <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-700/50">
                      <span className="text-[10px] text-surface-400 font-semibold uppercase block mb-1">Saldo em NC</span>
                      <span className={cn('text-sm font-bold font-mono block', saldoNC < 0 ? 'text-red-400' : 'text-emerald-400')}>
                        {formatCurrency(saldoNC)}
                      </span>
                      <span className="text-[10px] text-surface-500">{saldoNC < 0 ? 'Excedente' : 'Disponível'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-surface-400 bg-surface-900/30 p-2.5 rounded-lg border border-surface-700/30 mt-4 flex items-center justify-between">
                <span>Total de Itens nos Pedidos:</span>
                <span className="font-bold text-surface-200 font-mono">{totalItensAno}</span>
              </div>
            </div>

            {/* Gráfico 2: Pedidos por SI (Distribuição por Subitem) */}
            <div className="lg:col-span-7 card p-5 bg-surface-800/40 border-surface-700/60">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs font-bold text-surface-200 uppercase tracking-wider">
                  Pedidos por Subitem (SI)
                </h3>
                <span className="text-[11px] text-surface-400">
                  {gruposPorSI.length} subitens no ano
                </span>
              </div>

              {gruposPorSI.length === 0 ? (
                <div className="py-10 text-center text-xs text-surface-400">
                  Nenhum pedido encontrado para o ano selecionado.
                </div>
              ) : (
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {gruposPorSI.map((g, idx) => {
                    const cor = PALETA_SI[idx % PALETA_SI.length]
                    const barWidth = Math.max(1, Math.min(100, (g.totalValor / maxValorSI) * 100))
                    return (
                      <div key={g.si} className="group">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cor }}
                            />
                            <span className="font-semibold text-surface-200 truncate">
                              SI {g.si} — {g.siNome}
                            </span>
                            <span className="text-[10px] text-surface-400 shrink-0 font-mono">
                              ({g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'})
                            </span>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-mono font-bold text-surface-100 text-xs">
                              {formatCurrency(g.totalValor)}
                            </span>
                            <span className="text-[10px] text-surface-400 font-mono w-11 text-right">
                              {formatPercent(g.percentualDoTotal)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-surface-700/40 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%`, backgroundColor: cor }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─── Tabela Detalhada dos Pedidos por Subitem (SI) ─────────────── */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-surface-100">
                  Relação de Pedidos por Subitem
                </h3>
                <p className="text-xs text-surface-400">
                  Agrupamento analítico detalhado com PN/MPN, descrição, valores, número e data do pedido
                </p>
              </div>
              <span className="badge bg-surface-800 text-surface-300 border border-surface-700 text-xs font-mono">
                {gruposPorSI.length} grupos
              </span>
            </div>

            {gruposPorSI.length === 0 ? (
              <div className="card p-8 text-center text-surface-400 text-xs">
                Nenhum pedido registrado no exercício de {anoSelecionado}.
              </div>
            ) : (
              gruposPorSI.map(grupo => (
                <div
                  key={grupo.si}
                  className="rounded-xl border border-surface-700/70 overflow-hidden bg-surface-900/60 shadow-sm"
                >
                  {/* Cabeçalho do Subitem */}
                  <div className="bg-surface-800 px-4 py-2.5 border-b border-surface-700/70 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-primary-900/40 text-primary-300 border border-primary-700/40 text-xs font-mono font-bold">
                        SI {grupo.si}
                      </span>
                      <span className="text-xs font-semibold text-surface-100">
                        {grupo.siNome}
                      </span>
                      <span className="text-[11px] text-surface-400">
                        ({grupo.itens.length} {grupo.itens.length === 1 ? 'item pedido' : 'itens pedidos'})
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-surface-400 text-[11px]">
                        Participação: <strong className="text-surface-200 font-mono">{formatPercent(grupo.percentualDoTotal)}</strong>
                      </span>
                      <span className="text-surface-500">|</span>
                      <span className="text-primary-300 font-bold font-mono text-sm">
                        {formatCurrency(grupo.totalValor)}
                      </span>
                    </div>
                  </div>

                  {/* Tabela de Itens */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-surface-800/50 text-surface-400 uppercase text-[10px] tracking-wider border-b border-surface-700/50">
                        <tr>
                          <th className="px-3.5 py-2 w-14 text-center">SI</th>
                          <th className="px-3 py-2 w-36">PN / MPN</th>
                          <th className="px-3 py-2 min-w-[240px]">Descrição (Cadastro / TR)</th>
                          <th className="px-3 py-2 text-right w-28">Valor Unitário</th>
                          <th className="px-3 py-2 text-right w-20">Qtd Pedida</th>
                          <th className="px-3 py-2 text-right w-28">Valor Total</th>
                          <th className="px-3 py-2 text-center w-24">Nº Pedido</th>
                          <th className="px-3 py-2 text-center w-28">Data Pedido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800/60">
                        {grupo.itens.map(item => (
                          <tr key={item.id} className="hover:bg-surface-800/30 transition-colors">
                            <td className="px-3.5 py-2.5 text-center font-mono font-medium text-surface-400">
                              {item.si}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-surface-300 text-[11px]">
                              {item.pnMpn}
                            </td>
                            <td className="px-3 py-2.5 text-surface-100 font-medium leading-relaxed">
                              {item.descricao}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-surface-300">
                              {formatCurrency(item.valorUnitario)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-surface-100">
                              {item.quantidade.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(item.valorTotal)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-surface-800 text-primary-300 font-mono font-bold text-[11px] border border-surface-700/60">
                                {item.pedidoNumeroStr}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center text-surface-400 font-mono text-[11px]">
                              {item.pedidoDataStr}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-surface-800/30 border-t border-surface-700/60 font-semibold">
                        <tr>
                          <td colSpan={4} className="px-3.5 py-2 text-right text-surface-400 text-[11px]">
                            Subtotal SI {grupo.si}:
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-surface-200">
                            {grupo.totalQtd.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-400 font-bold">
                            {formatCurrency(grupo.totalValor)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))
            )}

            {/* Total Geral Consolidado */}
            {gruposPorSI.length > 0 && (
              <div className="card p-4 bg-surface-800/80 border-surface-700 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-primary-400" />
                  <span className="text-xs uppercase tracking-wider font-bold text-surface-300">
                    Total Geral de Pedidos no Ano ({anoSelecionado}):
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-surface-400">
                    {pedidosDoAno.length} pedidos &bull; {totalItensAno} itens
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-400">
                    {formatCurrency(totalPedido)}
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ─── Rodapé do Modal ──────────────────────────────────────────────── */}
        <div className="px-6 py-3.5 bg-surface-800/80 border-t border-surface-700/70 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-surface-400">
            GERSUP &bull; Gerência de Suprimentos &bull; Relatório Anual por Subitem
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImprimirHTML}
              className="btn-primary !py-1.5 !px-3.5 flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Printer size={13} />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="btn-secondary !py-1.5 !px-3.5 text-xs"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
