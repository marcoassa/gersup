import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, RefreshCw, Box, Printer, X, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useQuery } from '@/hooks/useQuery'
import { getPregoes, searchItensGlobais } from '@/lib/api'
import { enrichPregao, formatCurrency, formatDate, formatPercent, cn, extrairTituloItem, extrairModeloMarcaRef } from '@/lib/utils'
import { LoadingSpinner, ErrorCard } from '@/components/ui/States'
import ModalImportarPncp from '@/components/pregoes/ModalImportarPncp'
import ModalAtualizarTodos from '@/components/pregoes/ModalAtualizarTodos'

const STATUS_LABEL: Record<string, string> = { VIGENTES: 'Vigentes', ATIVO: 'Ativo', A_VENCER: 'A Vencer', VENCIDO: 'Vencido', TODOS: 'Todos' }
const STATUS_CLASS: Record<string, string> = { ATIVO: 'badge-ativo', A_VENCER: 'badge-avencer', VENCIDO: 'badge-vencido' }

function imprimirPregoesPDF(pregoes: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  const printHeader = (doc: any, pageNum: number) => {
    doc.setFillColor(35, 47, 28)
    doc.rect(0, 0, pageW, 22, 'F')
    doc.setFontSize(13)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('GERSUP — Relatório Completo de Pregões', 10, 9)
    doc.setFontSize(8.5)
    doc.setTextColor(250, 204, 21)
    doc.setFont('helvetica', 'normal')
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Total de Pregões: ${pregoes.length}  |  Página: ${pageNum}`, 10, 16)
  }

  let globalPage = 1
  printHeader(doc, globalPage)
  
  let cursorY = 28

  for (const p of pregoes) {
    if (cursorY > 170) {
      doc.addPage()
      globalPage++
      printHeader(doc, globalPage)
      cursorY = 28
    }

    // Header do Pregão
    doc.setFillColor(52, 71, 42)
    doc.rect(10, cursorY, pageW - 20, 14, 'F')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    const statusLabel = STATUS_LABEL[p.status] || p.status
    doc.text(`Pregão: ${p.numero_pregao || '—'}  |  Vencimento: ${formatDate(p.data_vencimento)}  |  Status: ${statusLabel}  |  Valor: ${formatCurrency(p.valor_total)}`, 13, cursorY + 5)
    
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(244, 248, 240)
    const objText = p.objeto ? (p.objeto.length > 180 ? p.objeto.slice(0, 180) + '...' : p.objeto) : '—'
    doc.text(`Objeto: ${objText}`, 13, cursorY + 10)
    
    cursorY += 16

    const itens = p.itens || []
    if (itens.length === 0) {
       doc.setFontSize(8)
       doc.setTextColor(71, 85, 105)
       doc.text('Nenhum item cadastrado para este pregão.', 13, cursorY + 2)
       cursorY += 12
       continue
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 10, right: 10, top: 28, bottom: 15 },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [235, 242, 228],
        textColor: [52, 71, 42],
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      head: [[
        'Nº', 'Descrição', 'Un.', 'Licitado', 'Empenhado', 'Saldo', 'Vl. Unit.', 'MASTER', 'CM', 'Status'
      ]],
      body: [...itens].sort((a: any, b: any) => a.numero_item - b.numero_item).map((i: any) => {
         const titulo = extrairTituloItem(i.descricao_tr || i.descricao_pregao || i.descricao)
         return [
           i.numero_item?.toString() || '—',
           titulo,
           i.unidade || '—',
           Number(i.quantidade_licitada).toLocaleString('pt-BR'),
           Number(i.quantidade_empenhada).toLocaleString('pt-BR'),
           Number(i.saldo_empenho).toLocaleString('pt-BR'),
           formatCurrency(i.valor_unitario),
           i.cd_comp_master || '—',
           i.cm || '—',
           i.status_pncp || '—'
         ]
      }),
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 85 },
        2: { halign: 'center', cellWidth: 12 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'right', cellWidth: 28 },
        7: { halign: 'center', cellWidth: 40 },
        8: { halign: 'center', cellWidth: 15 },
        9: { halign: 'center', cellWidth: 20 },
      },
      didDrawPage: (data: any) => {
         if (data.pageNumber > 1) {
            globalPage++
            printHeader(doc, globalPage)
         }
      }
    })

    cursorY = (doc as any).lastAutoTable.finalY + 10
  }

  doc.save('relatorio-pregoes-detalhado.pdf')
}

export default function Pregoes() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('VIGENTES')
  const [modalAberto, setModalAberto] = useState(false)
  const [modalAtualizarTodosAberto, setModalAtualizarTodosAberto] = useState(false)
  
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true)
      const incluirVencidos = filtroStatus === 'VENCIDO' || filtroStatus === 'TODOS'
      const { data } = await searchItensGlobais(search, incluirVencidos)
      setSearchResults(data || [])
      setShowDropdown(true)
      setIsSearching(false)
    }, 400)

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [search])

  useEffect(() => {
    const handleClick = () => setShowDropdown(false)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const { data, loading, error, refetch } = useQuery(getPregoes)

  const cards = useMemo(() => (data ?? []).map(enrichPregao), [data])

  const idsParaAtualizar = useMemo(() => {
    return cards.map(c => c.id_pncp_compra).filter(Boolean) as string[]
  }, [cards])

  const pregoesSugeridos = useMemo(() => {
    const q = search.trim()
    if (q.length < 2) return []
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const normQ = normalize(q)
    return cards.filter(c => {
      const matchStatus =
        filtroStatus === 'TODOS' ? true :
        filtroStatus === 'VIGENTES' ? c.status !== 'VENCIDO' :
        c.status === filtroStatus
      if (!matchStatus) return false
      return (
        normalize(c.numero_pregao || '').includes(normQ) ||
        normalize(c.objeto || '').includes(normQ)
      )
    }).slice(0, 4)
  }, [cards, search, filtroStatus])

  // Busca instantânea nos itens dos pregões já carregados na memória
  const itensSugeridos = useMemo(() => {
    const q = search.trim()
    if (q.length < 2) return []
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const normQ = normalize(q)

    const matches: any[] = []

    for (const c of cards) {
      const matchStatus =
        filtroStatus === 'TODOS' ? true :
        filtroStatus === 'VIGENTES' ? c.status !== 'VENCIDO' :
        c.status === filtroStatus

      if (!matchStatus) continue

      for (const item of (c.itens || [])) {
        const desc = normalize(item.descricao || '')
        const tr = normalize(item.descricao_tr || '')
        const master = normalize(item.cd_comp_master || '')
        const cm = normalize(item.cm || '')
        const num = String(item.numero_item)

        if (desc.includes(normQ) || tr.includes(normQ) || master.includes(normQ) || cm.includes(normQ) || num === normQ) {
          matches.push({
            ...item,
            pregao_id: c.id,
            pregoes: {
              id: c.id,
              numero_pregao: c.numero_pregao,
              objeto: c.objeto,
              status: c.status,
            }
          })
        }
      }
    }

    return matches
  }, [cards, search, filtroStatus])

  // Combina resultados instantâneos da memória com eventuais resultados da API
  const itensExibicao = useMemo(() => {
    if (itensSugeridos.length > 0) return itensSugeridos
    return searchResults
  }, [itensSugeridos, searchResults])

  const filtered = useMemo(() => {
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const q = normalize(search.trim())

    return cards.filter(c => {
      if (filtroStatus === 'TODOS') {
        // passa
      } else if (filtroStatus === 'VIGENTES') {
        if (c.status === 'VENCIDO') return false
      } else if (c.status !== filtroStatus) {
        return false
      }

      if (!q) return true

      const matchPregao =
        normalize(c.numero_pregao || '').includes(q) ||
        normalize(c.objeto || '').includes(q)
      if (matchPregao) return true

      const matchItens = c.itens?.some(i =>
        (i.descricao_tr && normalize(i.descricao_tr).includes(q)) ||
        (i.descricao && normalize(i.descricao).includes(q)) ||
        (i.cd_comp_master && normalize(i.cd_comp_master).includes(q)) ||
        (i.cm && normalize(i.cm).includes(q)) ||
        String(i.numero_item) === q
      )

      return !!matchItens
    })
  }, [cards, filtroStatus, search])

  if (error) return <ErrorCard message={error} onRetry={refetch} />

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48" onClick={e => e.stopPropagation()}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input 
              className="input pl-9 pr-8" 
              placeholder="Buscar produtos ou pregão..." 
              value={search} 
              onChange={e => {
                setSearch(e.target.value)
                setShowDropdown(true)
              }} 
              onFocus={() => {
                if (itensExibicao.length > 0 || pregoesSugeridos.length > 0) setShowDropdown(true)
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setSearchResults([])
                  setShowDropdown(false)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
            {/* Dropdown de produtos e pregões */}
            {showDropdown && search.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-600 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                {(pregoesSugeridos.length > 0 || itensExibicao.length > 0) ? (
                  <div>
                    {pregoesSugeridos.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-surface-400 bg-surface-900/50 uppercase tracking-wider">
                          Pregões
                        </div>
                        <ul>
                          {pregoesSugeridos.map(p => (
                            <li
                              key={p.id}
                              className="p-3 hover:bg-surface-700 cursor-pointer border-b border-surface-700/50 last:border-0"
                              onClick={() => {
                                setShowDropdown(false)
                                navigate(`/pregoes/${p.id}`)
                              }}
                            >
                              <div className="flex gap-2 items-start">
                                <FileText size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-surface-100 font-medium">
                                    Pregão {p.numero_pregao}
                                  </div>
                                  <div className="text-xs text-surface-400 line-clamp-1 mt-0.5">
                                    {p.objeto || 'Sem objeto'}
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {itensExibicao.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-surface-400 bg-surface-900/50 uppercase tracking-wider">
                          Itens / Produtos ({itensExibicao.length})
                        </div>
                        <ul>
                          {itensExibicao.map(item => {
                            const modeloMarca = extrairModeloMarcaRef(item.descricao_tr)
                            const titulo = modeloMarca !== 'SEM TERMO DE REFERENCIA' ? modeloMarca : extrairTituloItem(item.descricao)
                            return (
                              <li
                                key={item.id}
                                className="p-3 hover:bg-surface-700 cursor-pointer border-b border-surface-700/50 last:border-0"
                                onClick={() => {
                                  setShowDropdown(false)
                                  navigate(`/pregoes/${item.pregao_id}?item=${item.numero_item}`)
                                }}
                              >
                                <div className="flex gap-2 items-start">
                                  <Box size={14} className="text-primary-400 mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-surface-100 font-medium truncate">
                                      Item {item.numero_item} — {titulo}
                                    </div>
                                    {item.descricao_tr ? (
                                      <div className="text-xs text-primary-300/80 line-clamp-1 mt-0.5 font-sans" title={item.descricao_tr}>
                                        TR: {item.descricao_tr}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-amber-400 font-semibold mt-0.5 font-sans">
                                        SEM TERMO DE REFERENCIA
                                      </div>
                                    )}
                                    <div className="text-xs text-surface-400 mt-0.5 flex items-center gap-2">
                                      <span>Pregão: <strong className="text-surface-200">{item.pregoes?.numero_pregao}</strong></span>
                                      {item.pregoes?.objeto && (
                                        <span className="truncate max-w-xs text-surface-500">• {item.pregoes.objeto}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : isSearching ? (
                  <div className="p-3 text-center text-xs text-surface-400">Buscando produtos e pregões...</div>
                ) : (
                  <div className="p-4 text-center text-xs text-surface-400">
                    Nenhum produto ou pregão encontrado para <strong className="text-surface-200 font-mono">"{search}"</strong>.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {['VIGENTES', 'ATIVO', 'A_VENCER', 'VENCIDO', 'TODOS'].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  filtroStatus === s
                    ? 'bg-primary-600 border-primary-500 text-white'
                    : 'bg-surface-700 border-surface-600 text-surface-200 hover:text-white'
                )}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <span className="text-xs text-surface-300">{filtered.length} pregão(s)</span>

          <div className="flex gap-2 ml-auto">
            {filtered.length > 0 && (
              <button
                onClick={() => imprimirPregoesPDF(filtered)}
                className="btn-secondary"
                title="Exportar para PDF"
              >
                <Printer size={15} />
                Exportar PDF
              </button>
            )}
            {idsParaAtualizar.length > 0 && (
              <button
                onClick={() => setModalAtualizarTodosAberto(true)}
                className="btn-secondary"
                title="Atualizar todos os pregões com dados recentes do PNCP"
              >
                <RefreshCw size={15} />
                Atualizar Todos
              </button>
            )}
            {/* Botão de importação PNCP */}
            <button
              id="btn-adicionar-pregao"
              onClick={() => setModalAberto(true)}
              className="btn-primary"
            >
              <Plus size={15} />
              Adicionar / Atualizar Pregão
            </button>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="py-12">
              <LoadingSpinner text="Carregando pregões..." />
            </div>
          ) : (
            <table className="table-base">
              <thead className="sticky top-0 z-10 bg-surface-800 shadow-sm">
                <tr>
                  <th>Pregão / ATA</th><th>Objeto</th><th>Validade</th><th>Status</th>
                  <th className="text-right">Valor Total</th><th className="text-right">Empenhado</th>
                  <th className="text-right">Saldo</th><th className="text-center">Itens</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => {
                  const normQ = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                  const itensCorrespondentes = search.trim().length >= 2 ? (card.itens || []).filter(i => {
                    const desc = (i.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    const tr = (i.descricao_tr || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    const master = (i.cd_comp_master || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    const num = String(i.numero_item)
                    return desc.includes(normQ) || tr.includes(normQ) || master.includes(normQ) || num === normQ
                  }) : []

                  return (
                    <tr key={card.id} className="cursor-pointer" onClick={() => navigate(`/pregoes/${card.id}${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`)}>
                      <td className="font-mono text-xs text-primary-300">{card.numero_pregao}</td>
                      <td className="max-w-xs">
                        <p className="line-clamp-2 text-xs">{card.objeto}</p>
                        {itensCorrespondentes.length > 0 && (
                          <div className="text-[11px] text-emerald-400 font-medium mt-1 flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            <span>{itensCorrespondentes.length} item(ns) encontrado(s) com "{search}" (Itens: {itensCorrespondentes.slice(0, 5).map(i => i.numero_item).join(', ')}{itensCorrespondentes.length > 5 ? '...' : ''})</span>
                          </div>
                        )}
                      </td>
                      <td className={cn('text-xs', card.status === 'VENCIDO' ? 'text-red-400' : card.status === 'A_VENCER' ? 'text-amber-400' : '')}>{formatDate(card.data_vencimento)}</td>
                      <td><span className={STATUS_CLASS[card.status]}>{STATUS_LABEL[card.status]}</span></td>
                      <td className="text-right text-xs">{formatCurrency(card.valor_total)}</td>
                      <td className="text-right text-xs">{formatPercent(card.percentual_empenhado)}</td>
                      <td className={cn('text-right text-xs font-semibold', card.saldo_disponivel <= 0 ? 'text-red-400' : 'text-emerald-400')}>{formatCurrency(card.saldo_disponivel)}</td>
                      <td className="text-center text-xs">
                        {card.quantidade_itens}
                        {itensCorrespondentes.length > 0 && (
                          <span className="block text-[10px] text-emerald-400 font-medium font-mono">
                            {itensCorrespondentes.length} match
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {filtered.length === 0 && !loading && (
            <div className="py-16 text-center space-y-3">
              {search.trim() ? (
                <>
                  <p className="text-surface-300 text-sm">
                    Nenhum pregão ou item encontrado para <strong className="text-primary-300 font-mono">"{search}"</strong>.
                  </p>
                  <p className="text-surface-400 text-xs">
                    Tente buscar pelo número do pregão, objeto, nome do produto ou termo de referência (ex: LOCTITE, código MASTER).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-surface-300 text-sm">Nenhum pregão cadastrado.</p>
                  <p className="text-surface-400 text-xs">Clique em <strong className="text-primary-300">Adicionar / Atualizar Pregão</strong> para importar dados via PNCP.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de importação */}
      {modalAberto && (
        <ModalImportarPncp
          onClose={() => setModalAberto(false)}
          onSuccess={() => {
            refetch()
          }}
        />
      )}

      {/* Modal atualizar todos */}
      {modalAtualizarTodosAberto && (
        <ModalAtualizarTodos
          idsParaAtualizar={idsParaAtualizar}
          onClose={() => setModalAtualizarTodosAberto(false)}
          onSuccess={() => {
            refetch()
          }}
        />
      )}
    </>
  )
}
