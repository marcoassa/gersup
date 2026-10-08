import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Edit2, Check, X, RefreshCw, Trash2, AlertTriangle, Loader2, Search, Box, Pencil, Printer, CheckCircle2, Upload } from 'lucide-react'
import { useQuery } from '@/hooks/useQuery'
import { supabase } from '@/lib/supabase'
import { getPregaoById, updatePregao, deletePregao, updateItemPregao, getProdutosPaginado, atualizarEmpenhoItemPregao, recalcularSaldosPregaoDePedidos } from '@/lib/api'
import { importarOuAtualizarPregaoPorPncp } from '@/lib/comprasGovApi'
import { upsertPregaoPncp } from '@/lib/upsertPregao'
import { enrichPregao, enrichItem, formatCurrency, formatDate, formatPercent, cn, getSiTitulo, extrairTituloItem, extrairModeloMarcaRef } from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import ItemDescTooltip, { ResumoTRTooltipContent } from '@/components/ui/ItemDescTooltip'
import type { Produto } from '@/types'

const ITEM_STATUS_CLASS: Record<string, string> = {
  DISPONIVEL: 'badge bg-emerald-900/40 text-emerald-300 border-emerald-500/30',
  CRITICO: 'badge bg-amber-900/40 text-amber-300 border-amber-500/30',
  ESGOTADO: 'badge bg-red-900/40 text-red-300 border-red-500/30',
  CANCELADO: 'badge bg-surface-700/60 text-surface-300 border-surface-600/50',
}

function useDebounce<T>(value: T, delay = 400): T {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return d
}

export default function PregaoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: pregao, loading, error, refetch } = useQuery(
    () => getPregaoById(id!),
    [id]
  )

  const [editandoObjeto, setEditandoObjeto] = useState(false)
  const [editandoValidade, setEditandoValidade] = useState(false)
  const [editandoNup, setEditandoNup] = useState(false)
  const [editandoNumeroPregao, setEditandoNumeroPregao] = useState(false)
  const [objetoEdit, setObjetoEdit] = useState('')
  const [validadeEdit, setValidadeEdit] = useState('')
  const [nupEdit, setNupEdit] = useState('')
  const [numeroPregaoEdit, setNumeroPregaoEdit] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  const [resultadoAtualizacao, setResultadoAtualizacao] = useState<{ ok: boolean; msg: string } | null>(null)
  const [editandoEmpenhoItemId, setEditandoEmpenhoItemId] = useState<string | null>(null)
  const [valorEmpenhoEdit, setValorEmpenhoEdit] = useState<string>('')
  const [salvandoEmpenho, setSalvandoEmpenho] = useState(false)

  const [searchItens, setSearchItens] = useState(() => {
    return new URLSearchParams(window.location.search).get('q') || ''
  })

  useEffect(() => {
    const qParam = new URLSearchParams(location.search).get('q')
    if (qParam !== null && qParam !== undefined) {
      setSearchItens(qParam)
    }
  }, [location.search])

  const card = useMemo(() => pregao ? enrichPregao(pregao) : null, [pregao])
  const itensList = useMemo(() => {
    const list = (pregao?.itens ?? []).map(enrichItem)
    return list.sort((a, b) => a.numero_item - b.numero_item)
  }, [pregao])

  const itensFiltrados = useMemo(() => {
    if (!searchItens.trim()) return itensList
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const q = normalize(searchItens.trim())
    return itensList.filter(item =>
      (item.descricao && normalize(item.descricao).includes(q)) ||
      (item.descricao_tr && normalize(item.descricao_tr).includes(q)) ||
      (item.cd_comp_master && normalize(item.cd_comp_master).includes(q)) ||
      (item.cm && normalize(item.cm).includes(q)) ||
      (!item.descricao_tr && normalize('SEM TERMO DE REFERENCIA').includes(q)) ||
      String(item.numero_item) === q
    )
  }, [itensList, searchItens])

  // Efeito para rolar a tela até o item pesquisado na busca global
  useEffect(() => {
    if (loading || itensList.length === 0) return

    const params = new URLSearchParams(location.search)
    const itemId = params.get('item')
    
    if (itemId) {
      const el = document.getElementById(`item-${itemId}`)
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('highlight-pulse')
          // Remove o parâmetro para não rodar novamente ao atualizar
          window.history.replaceState({}, '', location.pathname)
        }, 300)
      }
    }
  }, [loading, itensList, location])

  // Modal de Pesquisa de MASTER
  const [itemEditandoMaster, setItemEditandoMaster] = useState<typeof itensList[0] | null>(null)
  const [searchMaster, setSearchMaster] = useState('')
  const [mastersResult, setMastersResult] = useState<Produto[]>([])
  const [loadingMasters, setLoadingMasters] = useState(false)
  const [salvandoMaster, setSalvandoMaster] = useState(false)

  const debouncedSearchMaster = useDebounce(searchMaster, 300)

  const loadMasters = useCallback(async () => {
    setLoadingMasters(true)
    const res = await getProdutosPaginado(debouncedSearchMaster, true, false, 0, 30)
    // Garante client-side que só MASTERs aparecem (dupla proteção)
    setMastersResult((res.rows ?? []).filter(p => p.pos_familia === 'MASTER'))
    setLoadingMasters(false)
  }, [debouncedSearchMaster])

  useEffect(() => {
    if (itemEditandoMaster) {
      loadMasters()
    }
  }, [itemEditandoMaster, loadMasters])

  const handleSelecionarMaster = async (cdCompMaster: string) => {
    if (!itemEditandoMaster) return
    // Segurança: não permitir vínculo com código vazio ou EQUIVALENTE
    if (cdCompMaster) {
      const prod = mastersResult.find(p => p.cd_comp === cdCompMaster)
      if (prod && prod.pos_familia !== 'MASTER') {
        alert(`"${cdCompMaster}" é um produto EQUIVALENTE e não pode ser usado como referência. Selecione apenas produtos MASTER.`)
        return
      }
    }
    setSalvandoMaster(true)
    await updateItemPregao(itemEditandoMaster.id, { cd_comp_master: cdCompMaster })
    setSalvandoMaster(false)
    setItemEditandoMaster(null)
    refetch()
  }

  const salvarObjeto = async () => {
    if (!id) return
    setSalvando(true)
    const { error } = await updatePregao(id, { objeto: objetoEdit })
    setSalvando(false)
    if (error) {
      alert(`Erro ao salvar objeto: ${error}`)
      return
    }
    setEditandoObjeto(false)
    refetch()
  }

  const salvarValidade = async () => {
    if (!id) return
    setSalvando(true)
    const { error } = await updatePregao(id, { data_vencimento: validadeEdit })
    setSalvando(false)
    if (error) {
      alert(`Erro ao salvar validade: ${error}`)
      return
    }
    setEditandoValidade(false)
    refetch()
  }

  const salvarNup = async () => {
    if (!id) return
    setSalvando(true)
    const { error } = await updatePregao(id, { nup: nupEdit.trim() || null })
    setSalvando(false)
    if (error) {
      alert(`Erro ao salvar NUP: ${error}`)
      return
    }
    setEditandoNup(false)
    refetch()
  }

  const salvarNumeroPregao = async () => {
    if (!id) return
    const valor = numeroPregaoEdit.trim()
    if (!valor) { setEditandoNumeroPregao(false); return }
    setSalvando(true)
    const { error } = await updatePregao(id, { numero_pregao: valor })
    setSalvando(false)
    if (error) {
      alert(`Erro ao salvar número do pregão: ${error}`)
      return
    }
    setEditandoNumeroPregao(false)
    refetch()
  }

  const handleExcluir = async () => {
    if (!id) return
    setExcluindo(true)
    const { error } = await deletePregao(id)
    setExcluindo(false)
    if (error) {
      alert(`Erro ao excluir: ${error}`)
      return
    }
    navigate('/pregoes')
  }

  const [extraindoTermo, setExtraindoTermo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pregao) return;

    setExtraindoTermo(true);
    setResultadoAtualizacao(null);
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const res = await fetch('http://localhost:3001/api/parse-pdf', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro na extração');
      }

      let updatedCount = 0;
      for (const item of data.items) {
        const itemNum = parseInt(item.Item, 10);
        if (isNaN(itemNum)) continue;
        
        await supabase
          .from('itens_pregao')
          .update({ descricao_tr: item["Descrição Completa"] })
          .eq('pregao_id', pregao.id)
          .eq('numero_item', itemNum);
        
        updatedCount++;
      }
      
      setResultadoAtualizacao({ ok: true, msg: `${updatedCount} itens atualizados com sucesso!` });
      refetch();
    } catch (err: any) {
      setResultadoAtualizacao({ ok: false, msg: err.message || 'Erro ao extrair termo' });
    } finally {
      setExtraindoTermo(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAtualizarDaApi = async () => {
    if (!pregao?.id_pncp_compra) return
    setAtualizando(true)
    setResultadoAtualizacao(null)
    try {
      const dados = await importarOuAtualizarPregaoPorPncp(pregao.id_pncp_compra)
      const { error } = await upsertPregaoPncp(dados)
      if (error) throw new Error(error)
      if (pregao.id) {
        await recalcularSaldosPregaoDePedidos(pregao.id)
      }
      setResultadoAtualizacao({ ok: true, msg: 'Atualizado com sucesso' })
      refetch()
    } catch (err) {
      setResultadoAtualizacao({ ok: false, msg: (err as Error).message || 'Erro ao atualizar' })
    } finally {
      setAtualizando(false)
      setTimeout(() => setResultadoAtualizacao(null), 4000)
    }
  }

  const iniciarEdicaoEmpenho = (item: any) => {
    setEditandoEmpenhoItemId(item.id)
    setValorEmpenhoEdit(String(item.quantidade_empenhada ?? 0))
  }

  const salvarEmpenhoItem = async (itemId: string) => {
    setSalvandoEmpenho(true)
    try {
      const num = Math.max(0, parseFloat(valorEmpenhoEdit.replace(',', '.')) || 0)
      const { error } = await atualizarEmpenhoItemPregao(itemId, num)
      if (error) throw new Error(error)
      setEditandoEmpenhoItemId(null)
      refetch()
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar empenho')
    } finally {
      setSalvandoEmpenho(false)
    }
  }

  const handlePrint = () => {
    if (!card) return
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    const statusColor = (status: string) => {
      if (status === 'DISPONIVEL') return '#10b981'
      if (status === 'CRITICO') return '#f59e0b'
      if (status === 'ESGOTADO') return '#ef4444'
      return '#6b7280'
    }

    const rows = itensList.map(item => {
      let descHtml = ''
      if (item.descricao_tr) {
        const modeloMarca = extrairModeloMarcaRef(item.descricao_tr)
        descHtml = `<span>${modeloMarca}</span>`
      } else {
        descHtml = '<span style="color:#b45309;font-weight:700;font-size:9px;">SEM TERMO DE REFERENCIA</span>'
      }

      return `
      <tr>
        <td>${item.numero_item}</td>
        <td class="desc">${descHtml}</td>
        <td>${item.unidade}</td>
        <td class="num">${Number(item.quantidade_licitada).toLocaleString('pt-BR')}</td>
        <td class="num">${Number(item.quantidade_empenhada).toLocaleString('pt-BR')}</td>
        <td class="num" style="color:${item.saldo_empenho <= 0 ? '#ef4444' : item.percentual_saldo < 10 ? '#f59e0b' : '#10b981'}">${Number(item.saldo_empenho).toLocaleString('pt-BR')}</td>
        <td class="num">${formatCurrency(Number(item.valor_unitario))}</td>
        <td class="mono">${item.cd_comp_master ?? '—'}</td>
        <td class="mono">${item.cm || item.produto?.cm || '—'}</td>
        <td class="center"><span class="badge" style="color:${statusColor(item.status_item)};border-color:${statusColor(item.status_item)}40">${item.status_item}</span></td>
      </tr>
    `
    }).join('')

    const now = new Date().toLocaleString('pt-BR')

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Pregão ${card.numero_pregao}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; padding: 28px 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #1a1a2e; margin-bottom: 20px; }
    .header-left h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; }
    .header-left p { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .header-right { text-align: right; font-size: 9px; color: #9ca3af; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; font-weight: 600; margin-bottom: 4px; }
    .kpi-value { font-size: 15px; font-weight: 700; color: #111827; }
    .kpi-value.amber { color: #b45309; }
    .kpi-value.green { color: #047857; }
    .kpi-value.red { color: #b91c1c; }
    .section { margin-bottom: 20px; }
    .section-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; font-weight: 600; margin-bottom: 4px; }
    .section-value { font-size: 12px; color: #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
    th.num, td.num { text-align: right; }
    th.center, td.center { text-align: center; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; color: #374151; }
    td.desc { max-width: 260px; line-height: 1.4; }
    td.mono { font-family: monospace; font-size: 9px; color: #6366f1; font-weight: 700; }
    tr:nth-child(even) td { background: #f9fafb; }
    .badge { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid; text-transform: uppercase; letter-spacing: .05em; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8.5px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${card.numero_pregao}</h1>
      <p>Detalhes do Pregão — GERSUP</p>
    </div>
    <div class="header-right">
      <div>Impresso em: ${now}</div>
      <div style="margin-top:4px;font-size:10px;font-weight:600;color:#374151">Gerente de Suprimento</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Valor Total</div><div class="kpi-value">${formatCurrency(card.valor_total)}</div></div>
    <div class="kpi"><div class="kpi-label">Empenhado</div><div class="kpi-value amber">${formatPercent(card.percentual_empenhado)}</div></div>
    <div class="kpi"><div class="kpi-label">Saldo Disponível</div><div class="kpi-value ${card.saldo_disponivel <= 0 ? 'red' : 'green'}">${formatCurrency(card.saldo_disponivel)}</div></div>
    <div class="kpi"><div class="kpi-label">Validade da Ata</div><div class="kpi-value ${card.status === 'VENCIDO' ? 'red' : card.status === 'A_VENCER' ? 'amber' : ''}">${formatDate(card.data_vencimento)}</div></div>
  </div>

  <div class="section">
    <div class="section-label">Objeto / Descrição Geral</div>
    <div class="section-value">${card.objeto}</div>
    ${card.observacoes ? `<div style="font-size:9.5px;color:#6b7280;margin-top:4px;font-style:italic">${card.observacoes}</div>` : ''}
  </div>

  <div style="font-size:10px;font-weight:600;color:#374151;margin-bottom:8px">Itens do Pregão (${itensList.length})</div>
  <table>
    <thead className="sticky top-0 z-10 bg-surface-800 shadow-sm">
      <tr>
        <th>Nº</th><th>Descrição</th><th>Un.</th>
        <th class="num">Licitado</th><th class="num">Empenhado</th>
        <th class="num">Saldo</th><th class="num">Vl. Unit.</th>
        <th>MASTER</th><th>CM</th><th class="center">Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <span>GERSUP — Sistema de Gerenciamento de Suprimentos</span>
    <span>Pregão ${card.numero_pregao}</span>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`)
    win.document.close()
  }

  if (loading) return <LoadingSpinner text="Carregando pregão..." />
  if (error) return <ErrorCard message={error} onRetry={refetch} />
  if (!card) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-surface-400">Pregão não encontrado.</p>
      <button className="btn-secondary" onClick={() => navigate('/pregoes')}><ArrowLeft size={14} /> Voltar</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button className="btn-secondary !px-2 !py-2" onClick={() => navigate('/pregoes')}><ArrowLeft size={16} /></button>
        <div>
          {editandoNumeroPregao ? (
            <div className="flex items-center gap-1.5">
              <input
                className="input font-bold text-surface-50 text-base !py-1 !px-2 w-44"
                value={numeroPregaoEdit}
                onChange={e => setNumeroPregaoEdit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') salvarNumeroPregao(); if (e.key === 'Escape') setEditandoNumeroPregao(false) }}
                placeholder="Ex: 90016/2026"
                autoFocus
              />
              <button className="btn-primary !px-2 !py-1" onClick={salvarNumeroPregao} disabled={salvando}><Check size={12} /></button>
              <button className="btn-secondary !px-2 !py-1" onClick={() => setEditandoNumeroPregao(false)}><X size={12} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <h2 className="font-bold text-surface-50">{card.numero_pregao}</h2>
              <button
                className="text-surface-600 hover:text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => { setNumeroPregaoEdit(card.numero_pregao); setEditandoNumeroPregao(true) }}
                title="Editar número do pregão"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
          <p className="text-xs text-surface-400">Detalhes do Pregão</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUploadPdf} 
            accept="application/pdf" 
            className="hidden" 
          />
          <button 
            className="btn-secondary !py-1.5 !px-3 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={extraindoTermo} 
            title="Extrair descrições do Termo de Referência em PDF"
          >
            {extraindoTermo
              ? <><Loader2 size={13} className="animate-spin" /> Extraindo...</>
              : <><Upload size={13} /> Extrair TR (PDF)</>}
          </button>
          
          <button className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 !py-1.5 !px-3" onClick={() => setModalExcluirAberto(true)}>
            <Trash2 size={13} /> Excluir
          </button>
          <button className="btn-secondary !py-1.5 !px-3" onClick={handleAtualizarDaApi} disabled={atualizando} title="Re-importar dados do PNCP">
            {atualizando
              ? <><Loader2 size={13} className="animate-spin" /> Atualizando...</>
              : <><RefreshCw size={13} /> Atualizar</>}
          </button>
          {resultadoAtualizacao && (
            <span className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border animate-fade-in',
              resultadoAtualizacao.ok
                ? 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30'
                : 'bg-red-900/40 text-red-300 border-red-500/30'
            )}>
              {resultadoAtualizacao.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {resultadoAtualizacao.msg}
            </span>
          )}
          <button className="btn-secondary !py-1.5 !px-3" onClick={handlePrint} title="Imprimir relatório do pregão">
            <Printer size={13} /> Imprimir
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card"><span className="stat-label">Valor Total</span><span className="stat-value text-base">{formatCurrency(card.valor_total)}</span></div>
        <div className="stat-card"><span className="stat-label">Empenhado</span><span className="stat-value text-base text-amber-400">{formatPercent(card.percentual_empenhado)}</span></div>
        <div className="stat-card"><span className="stat-label">Saldo Disponível</span><span className={cn('stat-value text-base', card.saldo_disponivel <= 0 ? 'text-red-400' : 'text-emerald-400')}>{formatCurrency(card.saldo_disponivel)}</span></div>
        <div className="stat-card">
          <span className="stat-label">Validade da Ata</span>
          {editandoValidade ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="date" className="input text-xs py-1" defaultValue={card.data_vencimento} onChange={e => setValidadeEdit(e.target.value)} />
              <button className="btn-primary !px-2 !py-1" onClick={salvarValidade} disabled={salvando}><Check size={12} /></button>
              <button className="btn-secondary !px-2 !py-1" onClick={() => setEditandoValidade(false)}><X size={12} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <span className={cn('stat-value text-base', card.status === 'VENCIDO' ? 'text-red-400' : card.status === 'A_VENCER' ? 'text-amber-400' : '')}>{formatDate(card.data_vencimento)}</span>
              <button className="text-surface-400 hover:text-surface-100" onClick={() => { setValidadeEdit(card.data_vencimento); setEditandoValidade(true) }}><Edit2 size={12} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Objeto editável + NUP */}
      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-surface-400 mb-1">Objeto / Descrição Geral</p>
            {editandoObjeto ? (
              <div className="flex gap-2">
                <input className="input flex-1" defaultValue={card.objeto} onChange={e => setObjetoEdit(e.target.value)} />
                <button className="btn-primary" onClick={salvarObjeto} disabled={salvando}>{salvando ? '...' : <Check size={14} />}</button>
                <button className="btn-secondary" onClick={() => setEditandoObjeto(false)}><X size={14} /></button>
              </div>
            ) : (
              <p className="text-sm text-surface-100">{card.objeto}</p>
            )}
          </div>
          {!editandoObjeto && (
            <button className="btn-secondary !px-2 !py-1" onClick={() => { setObjetoEdit(card.objeto); setEditandoObjeto(true) }}>
              <Edit2 size={14} />
            </button>
          )}
        </div>

        {/* NUP */}
        <div className="flex items-center gap-2 pt-2 border-t border-surface-700/40">
          <div className="flex-1">
            <p className="text-xs text-surface-400 mb-1">NUP — Número Único de Processo</p>
            {editandoNup ? (
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  placeholder="Ex: 65081.000123/2024-01"
                  value={nupEdit}
                  onChange={e => setNupEdit(e.target.value)}
                  autoFocus
                />
                <button className="btn-primary" onClick={salvarNup} disabled={salvando}>{salvando ? '...' : <Check size={14} />}</button>
                <button className="btn-secondary" onClick={() => setEditandoNup(false)}><X size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={card.nup ? 'text-sm font-mono text-surface-100' : 'text-sm text-surface-500 italic'}>
                  {card.nup ?? 'Não informado'}
                </span>
                {!card.nup && (
                  <span className="text-[10px] bg-amber-900/30 text-amber-300 border border-amber-700/30 px-1.5 py-0.5 rounded">
                    Preencha manualmente ou reimporte via PNCP
                  </span>
                )}
              </div>
            )}
          </div>
          {!editandoNup && (
            <button
              className="btn-secondary !px-2 !py-1 shrink-0"
              title="Editar NUP"
              onClick={() => { setNupEdit(card.nup ?? ''); setEditandoNup(true) }}
            >
              <Edit2 size={14} />
            </button>
          )}
        </div>

        {card.observacoes && <p className="text-xs text-surface-400 italic">{card.observacoes}</p>}
      </div>

      {/* Tabela de itens */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-600/40 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold">Itens do Pregão</h3>
          <span className="text-xs text-surface-400">
            {itensFiltrados.length !== itensList.length
              ? `${itensFiltrados.length} de ${itensList.length} item(s)`
              : `${itensList.length} item(s)`}
          </span>
          {itensList.length > 0 && itensList.every(i => !i.descricao_tr) && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              SEM TERMO DE REFERENCIA
            </span>
          )}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              className="input pl-8 py-1 text-xs w-56"
              placeholder="Buscar item ou CM..."
              value={searchItens}
              onChange={e => setSearchItens(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead className="sticky top-0 z-10 bg-surface-800 shadow-sm">
              <tr>
                <th>Nº</th><th>Descrição</th><th>Un.</th>
                <th className="text-right">Licitado</th><th className="text-right">Empenhado</th>
                <th className="text-right">Saldo</th><th className="text-right">Vl. Unit.</th>
                <th>MASTER</th><th>CM</th><th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map(item => (
                <tr key={item.id} id={`item-${item.numero_item}`}>
                  <td className="font-mono text-xs">{item.numero_item}</td>
                  <td className="max-w-xs text-xs">
                    {item.descricao_tr ? (() => {
                      const modeloMarca = extrairModeloMarcaRef(item.descricao_tr)
                      return (
                        <ItemDescTooltip
                          titulo={
                            <span className="text-surface-100 font-medium leading-snug">
                              {modeloMarca}
                            </span>
                          }
                          descricaoCompleta={
                            <ResumoTRTooltipContent
                              texto={item.descricao_tr}
                              tituloItem={`Item ${item.numero_item} — ${modeloMarca}`}
                              numeroItem={item.numero_item}
                            />
                          }
                        />
                      )
                    })() : (
                      <ItemDescTooltip
                        titulo={
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            SEM TERMO DE REFERENCIA
                          </span>
                        }
                        descricaoCompleta={
                          <div className="space-y-1.5 font-sans text-left">
                            <div className="text-[10px] font-bold tracking-wider text-amber-400 uppercase pb-1 border-b border-surface-700/60 flex items-center justify-between">
                              <span>Sem Termo de Referência</span>
                              <span className="text-[9px] text-surface-400 font-normal">Item {item.numero_item}</span>
                            </div>
                            <div className="text-surface-300 text-xs leading-relaxed">
                              {item.descricao || 'Item sem descrição técnica disponível.'}
                            </div>
                            <div className="text-[10px] text-surface-400 italic pt-1 border-t border-surface-800">
                              Utilize o botão "Extrair TR (PDF)" no topo para carregar o Termo de Referência deste pregão.
                            </div>
                          </div>
                        }
                      />
                    )}
                  </td>
                  <td className="text-xs">{item.unidade}</td>
                  <td className="text-right text-xs font-mono text-surface-300">
                    {Number(item.quantidade_licitada).toLocaleString('pt-BR')}
                  </td>
                  <td className="text-right text-xs">
                    {editandoEmpenhoItemId === item.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={item.quantidade_licitada}
                          className="input !py-0.5 !px-1 text-xs w-20 text-right font-mono"
                          value={valorEmpenhoEdit}
                          onChange={e => setValorEmpenhoEdit(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') salvarEmpenhoItem(item.id)
                            if (e.key === 'Escape') setEditandoEmpenhoItemId(null)
                          }}
                          autoFocus
                        />
                        <button
                          className="btn-primary !p-1 text-xs"
                          onClick={() => salvarEmpenhoItem(item.id)}
                          disabled={salvandoEmpenho}
                          title="Salvar quantidade empenhada"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className="btn-secondary !p-1 text-xs"
                          onClick={() => setEditandoEmpenhoItemId(null)}
                          title="Cancelar"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="group/emp flex items-center justify-end gap-1.5 cursor-pointer hover:text-amber-300"
                        onClick={() => iniciarEdicaoEmpenho(item)}
                        title="Clique para editar a quantidade empenhada deste item"
                      >
                        <span className={cn(Number(item.quantidade_empenhada) > 0 ? 'font-semibold text-amber-300' : 'text-surface-300')}>
                          {Number(item.quantidade_empenhada).toLocaleString('pt-BR')}
                        </span>
                        <Pencil size={11} className="opacity-0 group-hover/emp:opacity-100 text-surface-400 hover:text-surface-200 transition-opacity" />
                      </div>
                    )}
                  </td>
                  <td className={cn('text-right text-xs font-semibold',
                    item.saldo_empenho <= 0 ? 'text-red-400' :
                    item.percentual_saldo < 10 ? 'text-amber-400' : 'text-emerald-400'
                  )}>
                    {Number(item.saldo_empenho).toLocaleString('pt-BR')}
                  </td>
                  <td className="text-right text-xs">{formatCurrency(Number(item.valor_unitario))}</td>
                  <td className="font-mono text-xs text-surface-400">
                    <div className="flex items-center gap-2 group/master">
                      {item.cd_comp_master && item.produto ? (
                        <ItemDescTooltip
                          titulo={
                            <span className="text-primary-300 font-bold">
                              {item.cd_comp_master}
                            </span>
                          }
                          descricaoCompleta={
                            <div className="flex flex-col gap-1 font-sans">
                              <span className="font-bold text-surface-50">MASTER {item.cd_comp_master}</span>
                              <span className="text-surface-200">{item.produto.nomenclatura}</span>
                              <span className="text-[10px] text-surface-400 mt-1 font-mono">
                                PN: {item.produto.pn || 'N/A'} {item.produto.mpn ? `/ MPN: ${item.produto.mpn}` : ''}
                              </span>
                            </div>
                          }
                        />
                      ) : (
                        <span className={item.cd_comp_master ? 'text-primary-300 font-bold' : 'text-surface-500'}>
                          {item.cd_comp_master ?? '—'}
                        </span>
                      )}
                      <button
                        onClick={() => { setSearchMaster(''); setItemEditandoMaster(item) }}
                        className="opacity-0 group-hover/master:opacity-100 text-surface-400 hover:text-primary-400 transition-opacity p-0.5"
                        title="Editar MASTER relacionado ao item"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-surface-400">
                    {item.cm || item.produto?.cm || '—'}
                  </td>
                  <td className="text-center">
                    {item.status_pncp && item.status_pncp !== 'Homologado' ? (
                      <span className="badge bg-surface-700/60 text-surface-300 border-surface-600/50 uppercase text-[9px]">
                        {item.status_pncp}
                      </span>
                    ) : (
                      <span className={ITEM_STATUS_CLASS[item.status_item]}>{item.status_item}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Exclusão */}
      {modalExcluirAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7, 10, 20, 0.80)', backdropFilter: 'blur(6px)' }}
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-surface-800 shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-lg font-bold">Excluir Pregão?</h3>
              </div>
              <p className="text-sm text-surface-300">
                Tem certeza que deseja excluir o pregão <strong className="text-white">{card.numero_pregao}</strong>? Esta ação apagará a ata e todos os seus itens do banco de dados e não pode ser desfeita.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-surface-900 border-t border-surface-700/50">
              <button onClick={() => setModalExcluirAberto(false)} className="btn-secondary" disabled={excluindo}>Cancelar</button>
              <button onClick={handleExcluir} className="btn-primary !bg-red-500 hover:!bg-red-600 border-red-500" disabled={excluindo}>
                {excluindo ? <><Loader2 size={14} className="animate-spin" /> Excluindo...</> : <><Trash2 size={14} /> Sim, excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção de MASTER */}
      {itemEditandoMaster && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7, 10, 20, 0.80)', backdropFilter: 'blur(6px)' }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-surface-600/60 bg-surface-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-5 border-b border-surface-700/60 flex items-center justify-between bg-surface-800/50">
              <div>
                <h3 className="text-base font-bold text-surface-50">Relacionar Produto MASTER</h3>
                <p className="text-xs text-surface-400 mt-0.5 line-clamp-1">
                  Item {itemEditandoMaster.numero_item}:{' '}
                  <span
                    className="text-surface-200 font-medium"
                    title={itemEditandoMaster.descricao}
                  >
                    {extrairTituloItem(itemEditandoMaster.descricao)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setItemEditandoMaster(null)}
                className="text-surface-400 hover:text-surface-100 transition-colors"
                disabled={salvandoMaster}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-surface-700/60 bg-surface-900/40">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  className="input pl-9 w-full text-xs"
                  placeholder="Pesquisar MASTER por código, nomenclatura, CM ou PN..."
                  value={searchMaster}
                  onChange={e => setSearchMaster(e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-amber-400/70 mt-2 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                Apenas produtos <strong>MASTER</strong> são exibidos. Equivalentes não são aceitos como referência.
              </p>
            </div>

            {/* Lista de Resultados */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {loadingMasters ? (
                <div className="py-12"><LoadingSpinner text="Buscando produtos MASTER..." /></div>
              ) : mastersResult.length === 0 ? (
                <div className="py-12 text-center text-xs text-surface-400">
                  Nenhum produto MASTER encontrado para a pesquisa.
                </div>
              ) : (
                mastersResult.map(prod => (
                  <div
                    key={prod.cd_comp}
                    onClick={() => !salvandoMaster && handleSelecionarMaster(prod.cd_comp)}
                    className={`p-3 rounded-xl border border-surface-700/60 bg-surface-800/40 hover:bg-primary-600/10 hover:border-primary-500/30 transition-all cursor-pointer flex items-center justify-between gap-4 group ${
                      itemEditandoMaster.cd_comp_master === prod.cd_comp ? 'ring-1 ring-primary-500 bg-primary-600/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-0.5 p-1.5 rounded-lg bg-surface-700 text-primary-400 shrink-0">
                        <Box size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary-300">{prod.cd_comp}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-primary-900/40 text-primary-400 border border-primary-700/40 rounded font-bold uppercase tracking-wide">MASTER</span>
                          {prod.cm && <span className="text-[10px] px-1.5 py-0.5 bg-surface-700 text-surface-200 rounded font-mono">CM: {prod.cm}</span>}
                        </div>
                        <p className="text-xs text-surface-100 mt-0.5 truncate">{prod.nomenclatura}</p>
                        {prod.pn && <p className="text-[10px] text-surface-400 truncate mt-0.5">PN: {prod.pn}</p>}
                        {prod.si && <p className="text-[10px] text-surface-400 truncate mt-0.5">ND {prod.nd} / SI {prod.si} - {getSiTitulo(prod.si)}</p>}
                      </div>
                    </div>
                    <button
                      className="btn-primary !py-1 !px-2.5 text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                      disabled={salvandoMaster}
                    >
                      {salvandoMaster ? '...' : 'Selecionar'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer com opção de desvincular */}
            {itemEditandoMaster.cd_comp_master && (
              <div className="p-3 bg-surface-900/60 border-t border-surface-700/60 flex justify-between items-center">
                <span className="text-[10px] text-surface-400">Atualmente vinculado: <strong className="text-primary-400 font-mono">{itemEditandoMaster.cd_comp_master}</strong></span>
                <button
                  onClick={() => handleSelecionarMaster('')}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  disabled={salvandoMaster}
                >
                  Desvincular MASTER
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
