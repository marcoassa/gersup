import { useState, useRef, useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Play, StopCircle } from 'lucide-react'
import { importarOuAtualizarPregaoPorPncp } from '@/lib/comprasGovApi'
import { upsertPregaoPncp } from '@/lib/upsertPregao'

interface Props {
  idsParaAtualizar: string[]
  onClose: () => void
  onSuccess: () => void
}

type StatusItem = 'pendente' | 'processando' | 'sucesso' | 'erro' | 'cancelado'

interface ResultadoProcessamento {
  id: string
  status: StatusItem
  erro?: string
}

export default function ModalAtualizarTodos({ idsParaAtualizar, onClose, onSuccess }: Props) {
  const [resultados, setResultados] = useState<ResultadoProcessamento[]>(() =>
    idsParaAtualizar.map(id => ({ id, status: 'pendente' }))
  )
  const [emExecucao, setEmExecucao] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const abortRef = useRef(false)

  const concluidosCount = resultados.filter(r => r.status === 'sucesso').length
  const errosCount = resultados.filter(r => r.status === 'erro').length
  const processadosCount = resultados.filter(r => r.status !== 'pendente' && r.status !== 'cancelado').length
  const total = idsParaAtualizar.length
  const progresso = total === 0 ? 0 : Math.round((processadosCount / total) * 100)

  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  async function iniciarAtualizacao() {
    setEmExecucao(true)
    setConcluido(false)
    abortRef.current = false

    const novosResultados = [...resultados]
    
    // Reseta todos os que deram erro ou cancelados para pendente, se o usuário clicar novamente
    novosResultados.forEach(r => {
      if (r.status === 'erro' || r.status === 'cancelado') r.status = 'pendente'
    })
    setResultados([...novosResultados])

    for (let i = 0; i < novosResultados.length; i++) {
      if (abortRef.current) {
        // Marca os restantes como cancelados
        for (let j = i; j < novosResultados.length; j++) {
          if (novosResultados[j].status === 'pendente') novosResultados[j].status = 'cancelado'
        }
        setResultados([...novosResultados])
        break
      }

      if (novosResultados[i].status === 'sucesso') continue

      novosResultados[i].status = 'processando'
      setResultados([...novosResultados])

      try {
        const id = novosResultados[i].id
        const dados = await importarOuAtualizarPregaoPorPncp(id)
        
        if (abortRef.current) throw new Error('Operação cancelada pelo usuário')
        
        const { error: saveErr } = await upsertPregaoPncp(dados)
        
        if (saveErr) {
          throw new Error(saveErr)
        }

        novosResultados[i].status = 'sucesso'
      } catch (err: unknown) {
        const e = err as Error
        novosResultados[i].status = 'erro'
        novosResultados[i].erro = e.message
      }
      
      setResultados([...novosResultados])
      
      // Um pequeno delay entre requisições para não sobrecarregar a API
      if (i < novosResultados.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setEmExecucao(false)
    if (!abortRef.current) {
      setConcluido(true)
    }
  }

  function cancelar() {
    abortRef.current = true
    setEmExecucao(false)
  }

  function handleClose() {
    if (emExecucao) cancelar()
    if (concluidosCount > 0) onSuccess()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(7, 10, 20, 0.80)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !emExecucao) handleClose() }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-surface-600/50 shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[85vh]"
        style={{ background: 'linear-gradient(145deg, #131929 0%, #1a2236 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-600/40 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <RefreshCw size={18} className="text-primary-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Atualizar Todos os Pregões</h2>
            <p className="text-xs text-surface-300 mt-0.5">Sincronizando saldos e dados do PNCP em lote</p>
          </div>
          {!emExecucao && (
            <button onClick={handleClose} className="text-surface-400 hover:text-white transition-colors p-1 rounded">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-[300px]">
          
          {/* Status Geral */}
          <div className="bg-surface-800/50 border border-surface-600/30 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-surface-200">
                Progresso: {processadosCount} de {total}
              </span>
              <span className="text-xs font-mono text-primary-300 bg-primary-900/30 px-2 py-0.5 rounded">
                {progresso}%
              </span>
            </div>
            
            <div className="h-2 rounded-full bg-surface-700 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out"
                style={{ width: `${progresso}%` }}
              />
            </div>
            
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 size={14} />
                <span>{concluidosCount} Sucesso</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertCircle size={14} />
                <span>{errosCount} Erros</span>
              </div>
            </div>
          </div>

          {/* Lista de Processamento */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Log de Operações</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {resultados.map((r) => (
                <div key={r.id} className="flex items-start justify-between bg-surface-800/30 border border-surface-700/50 p-2.5 rounded-lg text-xs">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="font-mono text-surface-200 truncate">{r.id}</span>
                    {r.erro && <span className="text-red-400 line-clamp-2 text-[11px] mt-1">{r.erro}</span>}
                  </div>
                  <div className="ml-3 shrink-0 flex items-center">
                    {r.status === 'pendente' && <span className="text-surface-300 text-[10px] uppercase font-semibold">Pendente</span>}
                    {r.status === 'cancelado' && <span className="text-amber-500/70 text-[10px] uppercase font-semibold">Cancelado</span>}
                    {r.status === 'processando' && (
                      <div className="flex items-center gap-1.5 text-primary-400 bg-primary-900/20 px-2 py-0.5 rounded-full border border-primary-500/20">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-[10px] uppercase font-semibold">Processando</span>
                      </div>
                    )}
                    {r.status === 'sucesso' && (
                      <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 size={12} />
                        <span className="text-[10px] uppercase font-semibold">OK</span>
                      </div>
                    )}
                    {r.status === 'erro' && (
                      <div className="flex items-center gap-1.5 text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full border border-red-500/20">
                        <AlertCircle size={12} />
                        <span className="text-[10px] uppercase font-semibold">Erro</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {concluido && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/20 p-4 flex items-center gap-3">
              <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-300">Atualização em Lote Concluída!</p>
                <p className="text-xs text-surface-200 mt-0.5">Os dados do sistema foram sincronizados com o PNCP.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-600/40 shrink-0">
          {!emExecucao && !concluido && (
            <>
              <button onClick={handleClose} className="btn-secondary">Cancelar</button>
              <button onClick={iniciarAtualizacao} className="btn-primary">
                <Play size={14} /> Iniciar Atualização
              </button>
            </>
          )}

          {emExecucao && (
            <button onClick={cancelar} className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10">
              <StopCircle size={14} /> Parar Execução
            </button>
          )}

          {concluido && (
            <button onClick={handleClose} className="btn-primary">
              Fechar e Recarregar Página
            </button>
          )}

          {!emExecucao && !concluido && errosCount > 0 && processadosCount === total && (
            <button onClick={iniciarAtualizacao} className="btn-secondary gap-2">
              <RefreshCw size={14} /> Tentar Erros Novamente
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
