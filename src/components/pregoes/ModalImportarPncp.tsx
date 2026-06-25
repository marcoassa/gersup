import { useState, useRef, useEffect } from 'react'
import { X, Search, CheckCircle2, AlertCircle, Loader2, Download, RefreshCw, Info, AlertTriangle } from 'lucide-react'
import { parsePncpId, importarOuAtualizarPregaoPorPncp } from '@/lib/comprasGovApi'
import { upsertPregaoPncp } from '@/lib/upsertPregao'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Etapa = 'idle' | 'validando' | 'buscando_arp' | 'buscando_itens' | 'salvando' | 'concluido' | 'erro'

interface Resultado {
  objeto: string
  numeroAta: string
  itensNovos: number
  itensAtualizados: number
  dataAtualizacao: string
  avisoSaldo?: boolean
}

const ETAPA_LABEL: Record<Etapa, string> = {
  idle: '',
  validando: 'Validando ID PNCP...',
  buscando_arp: 'Consultando ARP na API Compras.gov.br...',
  buscando_itens: 'Importando itens e empenhos...',
  salvando: 'Salvando no banco de dados...',
  concluido: 'Concluído!',
  erro: 'Erro',
}

const EXEMPLO = '00394452000103-1-008230/2025'

export default function ModalImportarPncp({ onClose, onSuccess }: Props) {
  const [idPncp, setIdPncp] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('idle')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<{ msg: string; tipo?: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    return () => { abortRef.current = true }
  }, [])

  const isLoading = !['idle', 'concluido', 'erro'].includes(etapa)

  const progresso: Record<Etapa, number> = {
    idle: 0, validando: 20, buscando_arp: 40,
    buscando_itens: 65, salvando: 85, concluido: 100, erro: 0,
  }

  async function handleImportar() {
    if (!idPncp.trim()) return
    abortRef.current = false
    setErro(null)
    setResultado(null)

    try {
      // Etapa 1 — Validar
      setEtapa('validando')
      await new Promise(r => setTimeout(r, 300))
      if (abortRef.current) return

      const parsed = parsePncpId(idPncp.trim())
      if (!parsed) {
        setErro({ msg: `Formato inválido. Use o padrão: ${EXEMPLO}`, tipo: 'ID_INVALIDO' })
        setEtapa('erro')
        return
      }

      // Etapa 2 — Buscar ARP
      setEtapa('buscando_arp')

      // Etapa 3 — Buscar itens (progressão visual via timer)
      const timerItens = setTimeout(() => { if (!abortRef.current) setEtapa('buscando_itens') }, 1500)

      let dados
      try {
        dados = await importarOuAtualizarPregaoPorPncp(idPncp.trim())
      } catch (err: unknown) {
        clearTimeout(timerItens)
        const e = err as Error & { tipoErro?: string }
        setErro({ msg: e.message, tipo: e.tipoErro })
        setEtapa('erro')
        return
      }
      clearTimeout(timerItens)
      if (abortRef.current) return

      // Etapa 4 — Salvar
      setEtapa('salvando')
      const { data, error: saveErr } = await upsertPregaoPncp(dados)

      if (saveErr || !data) {
        setErro({ msg: saveErr ?? 'Erro desconhecido ao gravar no banco.', tipo: 'ERRO_BANCO' })
        setEtapa('erro')
        return
      }

      setResultado({
        objeto: dados.pregao.objeto,
        numeroAta: dados.pregao.numero_ata,
        itensNovos: data.itensNovos,
        itensAtualizados: data.itensAtualizados,
        dataAtualizacao: new Date().toLocaleString('pt-BR'),
        avisoSaldo: dados.avisoSaldoIndisponivel,
      })
      setEtapa('concluido')
      onSuccess()

    } catch (err: unknown) {
      const e = err as Error & { tipoErro?: string }
      setErro({ msg: e.message ?? 'Erro inesperado.', tipo: e.tipoErro })
      setEtapa('erro')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !isLoading) handleImportar()
    if (e.key === 'Escape') onClose()
  }

  function handleReset() {
    setEtapa('idle')
    setErro(null)
    setResultado(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const TIPO_ERRO_LABEL: Record<string, string> = {
    ID_INVALIDO: 'Formato de ID inválido',
    ATA_NAO_ENCONTRADA: 'ARP não encontrada na API',
    ITENS_VAZIOS: 'Nenhum item retornado',
    ERRO_REDE: 'Erro de conexão com a API',
    ERRO_BANCO: 'Erro ao gravar no banco',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7, 10, 20, 0.80)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-surface-600/50 shadow-2xl shadow-black/60 overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #131929 0%, #1a2236 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-600/40">
          <div className="w-9 h-9 rounded-lg bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <Download size={18} className="text-primary-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Adicionar / Atualizar Pregão</h2>
            <p className="text-xs text-surface-300 mt-0.5">Importar dados via API Compras.gov.br</p>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-white transition-colors p-1 rounded">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Campo de ID */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-surface-200 uppercase tracking-widest">
              ID PNCP da Contratação
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                ref={inputRef}
                type="text"
                value={idPncp}
                onChange={e => setIdPncp(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={EXEMPLO}
                className="input pl-10 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-start gap-1.5 text-xs text-surface-400">
              <Info size={12} className="mt-0.5 shrink-0 text-primary-400" />
              <span>Formato: <code className="text-primary-300 bg-primary-900/30 px-1 py-0.5 rounded text-[11px]">CNPJ-SEQ-NUMERO/ANO</code> — ex: <code className="text-surface-300 text-[11px]">{EXEMPLO}</code></span>
            </div>
          </div>

          {/* Progresso */}
          {isLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-surface-200">
                <Loader2 size={15} className="animate-spin text-primary-400" />
                <span>{ETAPA_LABEL[etapa]}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-700 ease-out"
                  style={{ width: `${progresso[etapa]}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['buscando_arp', 'buscando_itens', 'salvando', 'concluido'] as Etapa[]).map((e, idx) => {
                  const etapas: Etapa[] = ['buscando_arp', 'buscando_itens', 'salvando', 'concluido']
                  const atual = etapas.indexOf(etapa)
                  const done = atual > idx
                  const active = atual === idx
                  return (
                    <div key={e} className={`h-1 rounded-full transition-colors ${done ? 'bg-primary-500' : active ? 'bg-primary-400 animate-pulse' : 'bg-surface-600'}`} />
                  )
                })}
              </div>
            </div>
          )}

          {/* Resultado sucesso */}
          {etapa === 'concluido' && resultado && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-emerald-300">Pregão importado/atualizado com sucesso</span>
              </div>
              <div className="space-y-1 text-xs text-surface-200 pl-6">
                <p><span className="text-surface-400">ATA:</span> <span className="font-mono text-primary-300">{resultado.numeroAta}</span></p>
                <p className="line-clamp-2"><span className="text-surface-400">Objeto:</span> {resultado.objeto}</p>
                <div className="flex gap-4 pt-1">
                  <span className="text-emerald-300 font-semibold">+{resultado.itensNovos} novos</span>
                  <span className="text-sky-300 font-semibold">↺ {resultado.itensAtualizados} atualizados</span>
                </div>
                <p className="text-surface-400 pt-0.5">Atualizado em: {resultado.dataAtualizacao}</p>
              </div>
              {resultado.avisoSaldo && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 border border-amber-500/30 px-3 py-2">
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300">Itens importados, mas a API não retornou histórico de empenhos para esta Ata. A quantidade empenhada foi definida como zero e o saldo disponível permanece intacto (100%).</p>
                </div>
              )}
            </div>
          )}

          {/* Resultado erro */}
          {etapa === 'erro' && erro && (
            <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {erro.tipo && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-900/40 px-2 py-0.5 rounded">
                      {TIPO_ERRO_LABEL[erro.tipo] ?? erro.tipo}
                    </span>
                  )}
                  <p className="text-sm text-red-200">{erro.msg}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-600/40">
          {etapa === 'erro' && (
            <button onClick={handleReset} className="btn-secondary gap-2">
              <RefreshCw size={14} /> Tentar novamente
            </button>
          )}
          {etapa === 'concluido' && (
            <button onClick={onClose} className="btn-primary">
              Fechar
            </button>
          )}
          {['idle', 'erro'].includes(etapa) === false && etapa !== 'concluido' && (
            <button disabled className="btn-primary opacity-60 cursor-not-allowed">
              <Loader2 size={14} className="animate-spin" /> Importando...
            </button>
          )}
          {etapa === 'idle' && (
            <>
              <button onClick={onClose} className="btn-secondary">Cancelar</button>
              <button
                onClick={handleImportar}
                disabled={!idPncp.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={14} /> Importar Pregão
              </button>
            </>
          )}
          {etapa === 'erro' && (
            <button onClick={onClose} className="btn-secondary">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
