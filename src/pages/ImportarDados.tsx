import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp, Play } from 'lucide-react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import {
  processarCadastro, processarEstoque, processarFornecimentos,
  type ResultadoCadastro, type ResultadoEstoque, type ResultadoFornecimentos,
} from '@/lib/csvProcessor'

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────

type Etapa = 'cadastro' | 'estoque' | 'fornecimentos'
type Status = 'idle' | 'carregando' | 'processando' | 'importando' | 'ok' | 'erro'

interface EtapaState {
  status: Status
  arquivo: File | null
  nomeArquivo: string
  linhasOriginal: number
  linhasFiltradas: number
  linhasImportadas: number
  erro: string | null
  detalhe: string
}

const ETAPA_INFO: Record<Etapa, { label: string; arquivo: string; descricao: string }> = {
  cadastro: {
    label: '1. Cadastro de Componentes',
    arquivo: 'ConsDinamicaCadComponentes.csv',
    descricao: 'Base-mãe. Filtra Mercado Interno e identifica produtos MASTER.',
  },
  estoque: {
    label: '2. Estoque CAVEX',
    arquivo: 'ConsDinamicaEstoque.csv',
    descricao: 'Filtra BS_LOCAL=CAVEX e consolida por família MASTER.',
  },
  fornecimentos: {
    label: '3. Fornecimentos (últimos 5 anos)',
    arquivo: 'ConsDinamicaMatFornecido.csv',
    descricao: 'Filtra Ambiente=CAVEX, últimos 5 anos e consolida consumo por MASTER.',
  },
}

const BATCH = 500

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      delimiter: ';',
      encoding: 'UTF-8',
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: e => reject(new Error(e.message)),
    })
  })
}

async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[],
  conflictCol: string,
  onProgress: (n: number) => void
): Promise<string | null> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table as any).upsert(batch as any, {
      onConflict: conflictCol,
      ignoreDuplicates: false,
    })
    if (error) return error.message
    onProgress(Math.min(i + BATCH, rows.length))
  }
  return null
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const cfg: Record<Status, { cls: string; label: string }> = {
    idle: { cls: 'text-surface-400 bg-surface-700', label: 'Aguardando arquivo' },
    carregando: { cls: 'text-sky-300 bg-sky-900/40', label: 'Lendo arquivo...' },
    processando: { cls: 'text-amber-300 bg-amber-900/40', label: 'Processando...' },
    importando: { cls: 'text-primary-300 bg-primary-900/40', label: 'Importando...' },
    ok: { cls: 'text-emerald-300 bg-emerald-900/40', label: 'Importado ✓' },
    erro: { cls: 'text-red-300 bg-red-900/40', label: 'Erro' },
  }
  const { cls, label } = cfg[status]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
}

function ProgressBar({ current, total, show }: { current: number; total: number; show: boolean }) {
  if (!show || total === 0) return null
  const pct = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-surface-400 mb-1">
        <span>{current.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden">
        <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImportarDados() {
  const [etapas, setEtapas] = useState<Record<Etapa, EtapaState>>({
    cadastro: { status: 'idle', arquivo: null, nomeArquivo: '', linhasOriginal: 0, linhasFiltradas: 0, linhasImportadas: 0, erro: null, detalhe: '' },
    estoque: { status: 'idle', arquivo: null, nomeArquivo: '', linhasOriginal: 0, linhasFiltradas: 0, linhasImportadas: 0, erro: null, detalhe: '' },
    fornecimentos: { status: 'idle', arquivo: null, nomeArquivo: '', linhasOriginal: 0, linhasFiltradas: 0, linhasImportadas: 0, erro: null, detalhe: '' },
  })
  const [expandido, setExpandido] = useState<Etapa | null>('cadastro')
  const [progresso, setProgresso] = useState<Record<Etapa, number>>({ cadastro: 0, estoque: 0, fornecimentos: 0 })
  const [cadastroResult, setCadastroResult] = useState<ResultadoCadastro | null>(null)
  const [resumoFinal, setResumoFinal] = useState<string | null>(null)

  const fileRefs = {
    cadastro: useRef<HTMLInputElement>(null),
    estoque: useRef<HTMLInputElement>(null),
    fornecimentos: useRef<HTMLInputElement>(null),
  }

  const setEtapa = (etapa: Etapa, updates: Partial<EtapaState>) =>
    setEtapas(prev => ({ ...prev, [etapa]: { ...prev[etapa], ...updates } }))

  const setProg = (etapa: Etapa, n: number) =>
    setProgresso(prev => ({ ...prev, [etapa]: n }))

  const handleFile = (etapa: Etapa, file: File) => {
    setEtapa(etapa, { arquivo: file, nomeArquivo: file.name, status: 'idle', erro: null })
  }

  const handleDrop = (etapa: Etapa, e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(etapa, file)
  }

  // ─── Importar Cadastro ─────────────────────────────────────────────────────

  const importarCadastro = async () => {
    const { arquivo } = etapas.cadastro
    if (!arquivo) return
    setEtapa('cadastro', { status: 'carregando', erro: null })
    try {
      const rows = await parseCSV(arquivo)
      setEtapa('cadastro', { status: 'processando', linhasOriginal: rows.length })

      const result = processarCadastro(rows)
      setCadastroResult(result)
      setEtapa('cadastro', {
        status: 'importando',
        linhasFiltradas: result.totalMercadoInterno,
        detalhe: `${result.totalMasters} MASTER / ${result.totalEquivalentes} equivalentes`,
      })
      setProg('cadastro', 0)

      // Buscar CMs existentes para não apagá-los e contagiar os novos equivalentes
      setEtapa('cadastro', { status: 'carregando', detalhe: 'Recuperando códigos CM...' })
      const { data: existingCms } = await supabase
        .from('produtos' as any)
        .select('cd_comp, cm')
        .eq('pos_familia', 'MASTER')
        .not('cm', 'is', null)
        
      const cmMap = new Map((existingCms || []).map((p: any) => [p.cd_comp, p.cm]))

      // Upsert na tabela produtos
      const produtosRows = result.produtosValidos.map(p => {
        const masterCd = p.posFamilia === 'MASTER' ? p.cdComp : (p.cdCompMaster || p.cdComp)
        return {
          cd_comp: p.cdComp,
          cd_comp_master: p.cdCompMaster,
          pn: p.pn,
          mpn: p.mpn,
          nomenclatura: p.nomenclatura,
          fabricante: p.fabricante,
          cm: cmMap.get(masterCd) || null,
          nd: p.nd,
          si: p.si,
          pos_familia: p.posFamilia,
          mercado: 'INTERNO',
          aquisicoes: p.aquisicoes,
          dt_aprov_cadastro: p.dtAprovCadastro,
          preco_estimado: p.precoEstimado,
          ativo: true,
        }
      })

      const err = await upsertBatch('produtos', produtosRows, 'cd_comp',
        n => { setProg('cadastro', n); setEtapa('cadastro', { linhasImportadas: n }) }
      )
      if (err) throw new Error(err)
      setEtapa('cadastro', { status: 'ok', linhasImportadas: produtosRows.length })
    } catch (e: any) {
      setEtapa('cadastro', { status: 'erro', erro: e.message })
    }
  }

  // ─── Importar Estoque ──────────────────────────────────────────────────────

  const importarEstoque = async () => {
    const { arquivo } = etapas.estoque
    if (!arquivo) return

    // Garante mapa de componentes
    let mapa = cadastroResult?.mapaComponenteParaMaster
    if (!mapa || mapa.size === 0) {
      setEtapa('estoque', { status: 'carregando', detalhe: 'Carregando mapa do banco...' })
      mapa = new Map<string, string>()
      let page = 0
      while (true) {
        const { data, error } = await supabase.from('produtos' as any).select('cd_comp,cd_comp_master').eq('mercado', 'INTERNO').range(page * 1000, (page + 1) * 1000 - 1)
        if (error || !data || data.length === 0) break
        ;(data as any[]).forEach((p: any) => mapa!.set(p.cd_comp, p.cd_comp_master))
        page++
      }
    }

    setEtapa('estoque', { status: 'carregando', erro: null })
    try {
      const rows = await parseCSV(arquivo)
      setEtapa('estoque', { status: 'processando', linhasOriginal: rows.length })

      const result: ResultadoEstoque = processarEstoque(rows, mapa!)
      setEtapa('estoque', {
        status: 'importando',
        linhasFiltradas: result.totalLinhasMercadoInterno,
        detalhe: `${result.totalMastersComEstoque} MASTER com estoque`,
      })
      setProg('estoque', 0)

      const estoqueRows = result.estoquePorMaster.map(e => ({
        cd_comp: e.cdCompMaster,
        ambiente: 'CAVEX',
        estoque_lib: e.qtdLib,
        estoque_res: e.qtdRsv,
        estoque_total: e.estoqueTotal,
        data_referencia: new Date().toISOString().slice(0, 10),
      }))

      const err = await upsertBatch('estoque', estoqueRows, 'cd_comp,ambiente',
        n => { setProg('estoque', n); setEtapa('estoque', { linhasImportadas: n }) }
      )
      if (err) throw new Error(err)
      setEtapa('estoque', { status: 'ok', linhasImportadas: estoqueRows.length })
    } catch (e: any) {
      setEtapa('estoque', { status: 'erro', erro: e.message })
    }
  }

  // ─── Importar Fornecimentos ────────────────────────────────────────────────

  const importarFornecimentos = async () => {
    const { arquivo } = etapas.fornecimentos
    if (!arquivo) return

    let mapa = cadastroResult?.mapaComponenteParaMaster
    if (!mapa || mapa.size === 0) {
      setEtapa('fornecimentos', { status: 'carregando', detalhe: 'Carregando mapa do banco...' })
      mapa = new Map<string, string>()
      let page = 0
      while (true) {
        const { data, error } = await supabase.from('produtos' as any).select('cd_comp,cd_comp_master').eq('mercado', 'INTERNO').range(page * 1000, (page + 1) * 1000 - 1)
        if (error || !data || data.length === 0) break
        ;(data as any[]).forEach((p: any) => mapa!.set(p.cd_comp, p.cd_comp_master))
        page++
      }
    }

    setEtapa('fornecimentos', { status: 'carregando', erro: null })
    try {
      const rows = await parseCSV(arquivo)
      setEtapa('fornecimentos', { status: 'processando', linhasOriginal: rows.length })

      const result: ResultadoFornecimentos = processarFornecimentos(rows, mapa!)
      setEtapa('fornecimentos', {
        status: 'importando',
        linhasFiltradas: result.totalLinhasMercadoInterno,
        detalhe: `${result.totalLinhasUltimos5Anos.toLocaleString('pt-BR')} nos últimos 5 anos`,
      })
      setProg('fornecimentos', 0)

      // Limpar registros CAVEX existentes antes de reimportar
      await supabase.from('fornecimentos' as any).delete().eq('ambiente', 'CAVEX')

      const fornRows = result.fornecimentosFiltrados.map(f => ({
        cd_comp: f.cdCompOriginal,
        cd_comp_master: f.cdCompMaster,
        ano: f.ano,
        data: f.dataStr,
        quantidade: f.qtd,
        solicitante: f.solicitante,
        ambiente: 'CAVEX',
      }))

      const err = await upsertBatch('fornecimentos', fornRows, 'id',
        n => { setProg('fornecimentos', n); setEtapa('fornecimentos', { linhasImportadas: n }) }
      )
      if (err) throw new Error(err)
      setEtapa('fornecimentos', { status: 'ok', linhasImportadas: fornRows.length })

      setResumoFinal(`Importação completa! ${result.mediasPorMaster.length} MASTER com histórico de consumo. ${result.mediasPorMaster.filter(m => m.consumoRecorrente).length} com consumo recorrente.`)
    } catch (e: any) {
      setEtapa('fornecimentos', { status: 'erro', erro: e.message })
    }
  }

  const ACTIONS: Record<Etapa, () => void> = {
    cadastro: importarCadastro,
    estoque: importarEstoque,
    fornecimentos: importarFornecimentos,
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-surface-50">Importação de Dados</h2>
        <p className="text-xs text-surface-400 mt-1">
          Carregue as planilhas CSV na ordem indicada. O cadastro é a base-mãe e deve ser importado primeiro.
        </p>
      </div>

      {resumoFinal && (
        <div className="card flex items-center gap-3 border-emerald-700/40 bg-emerald-900/20 text-emerald-300 text-sm p-4">
          <CheckCircle size={18} />
          <span>{resumoFinal}</span>
          <button onClick={() => setResumoFinal(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {(Object.entries(ETAPA_INFO) as [Etapa, typeof ETAPA_INFO[Etapa]][]).map(([etapa, info]) => {
        const state = etapas[etapa]
        const isExp = expandido === etapa
        const canImport = !!state.arquivo && state.status !== 'importando' && state.status !== 'processando' && state.status !== 'carregando'
        const isRunning = ['carregando','processando','importando'].includes(state.status)

        return (
          <div key={etapa} className="card p-0 overflow-hidden">
            {/* Cabeçalho */}
            <button
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-700/30 transition-colors text-left"
              onClick={() => setExpandido(isExp ? null : etapa)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-0.5">
                  <span className="text-sm font-semibold text-surface-50">{info.label}</span>
                  <StatusBadge status={state.status} />
                </div>
                <p className="text-xs text-surface-400">{info.descricao}</p>
                {state.status === 'ok' && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {state.linhasImportadas.toLocaleString('pt-BR')} registros — {state.detalhe}
                  </p>
                )}
              </div>
              {isExp ? <ChevronUp size={16} className="text-surface-400" /> : <ChevronDown size={16} className="text-surface-400" />}
            </button>

            {/* Corpo expandido */}
            {isExp && (
              <div className="border-t border-surface-600/40 px-5 py-4 space-y-4">
                {/* Arquivo esperado */}
                <p className="text-xs text-surface-400">
                  Arquivo esperado: <code className="text-primary-300">{info.arquivo}</code>
                </p>

                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-surface-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary-500 transition-colors"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDrop(etapa, e)}
                  onClick={() => fileRefs[etapa].current?.click()}
                >
                  <Upload size={24} className="mx-auto mb-2 text-surface-400" />
                  {state.arquivo ? (
                    <p className="text-sm text-emerald-400 font-medium">{state.nomeArquivo}</p>
                  ) : (
                    <p className="text-sm text-surface-400">Clique ou arraste o arquivo CSV aqui</p>
                  )}
                  <input
                    ref={fileRefs[etapa]}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(etapa, f) }}
                  />
                </div>

                {/* Stats */}
                {state.linhasOriginal > 0 && (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'Total', val: state.linhasOriginal },
                      { label: 'Filtradas', val: state.linhasFiltradas },
                      { label: 'Importadas', val: state.linhasImportadas },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-surface-700/40 rounded-lg p-2">
                        <p className="text-lg font-bold text-surface-50">{val.toLocaleString('pt-BR')}</p>
                        <p className="text-[10px] text-surface-400">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barra de progresso */}
                <ProgressBar
                  current={progresso[etapa]}
                  total={state.linhasImportadas || state.linhasFiltradas}
                  show={state.status === 'importando'}
                />

                {/* Erro */}
                {state.erro && (
                  <div className="flex items-start gap-2 text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{state.erro}</span>
                  </div>
                )}

                {/* Botão importar */}
                <button
                  className="btn-primary w-full"
                  disabled={!canImport}
                  onClick={ACTIONS[etapa]}
                >
                  {isRunning ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="animate-spin">⟳</span> {state.status === 'carregando' ? 'Lendo...' : state.status === 'processando' ? 'Processando...' : 'Importando...'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 justify-center">
                      <Play size={14} /> {state.status === 'ok' ? 'Reimportar' : 'Importar'}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Notas */}
      <div className="text-xs text-surface-300 space-y-1 px-1">
        <p>• Para grandes volumes (100k+ linhas), prefira o script de linha de comando: <code className="text-surface-400">node scripts/importar-dados.mjs --all</code></p>
        <p>• Fornecimentos: apenas os últimos 5 anos são importados (filtro por Dt_Cadastro).</p>
        <p>• Estoque: agrupado por MASTER (soma QTD_LIB + QTD_RSV dos componentes equivalentes).</p>
      </div>
    </div>
  )
}
