import React from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { ItemPedidoCompra } from '../types'
import { getEmpenhosSped, linkSped, situacaoEmpenho } from '../lib/empenhosSped'

export function EmpenhosSpedItem({ item }: { item: Pick<ItemPedidoCompra, 'empenhos_sped'> }): React.JSX.Element {
  const registros = getEmpenhosSped(item)
  if (!registros.length) {
    return <span className="text-surface-400">Rastreio não informado</span>
  }

  return (
    <div className="min-w-[240px] max-w-[340px] space-y-3">
      {registros.map((e, index) => {
        const situacao = situacaoEmpenho(e)
        const processo = linkSped(e.processo_url)
        const documento = linkSped(e.documento_url)
        return (
          <section key={`${e.nup}-${e.numero}-${index}`} className="space-y-1.5">
            <p className="font-mono font-semibold text-surface-100">
              {e.numero || 'Empenho não definido'}
              {e.ug && <span className="ml-2 font-normal text-surface-400">UG {e.ug}</span>}
            </p>
            <p className="text-[10px] text-surface-300">
              <span className="text-surface-400">Processo de aquisição: </span>
              {processo ? (
                <a href={processo} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary-300 underline underline-offset-2 hover:text-primary-100"
                  title="Abrir processo no SPED (rede interna)">
                  {e.nup || 'Abrir no SPED'}<ExternalLink size={11} aria-hidden="true" />
                </a>
              ) : e.nup ? <span>{e.nup} <span className="text-surface-500">(sem link)</span></span> : 'Não identificado'}
            </p>
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] ${situacao.pendente
              ? 'border-amber-700/40 bg-amber-900/40 text-amber-200'
              : 'border-primary-700/40 bg-primary-900/40 text-primary-200'}`}>
              {situacao.pendente && <AlertTriangle size={11} aria-hidden="true" />}
              {situacao.label}
            </span>
            <details className="text-[10px] text-surface-300">
              <summary className="cursor-pointer text-surface-400 hover:text-surface-200">Fontes e ressalvas</summary>
              <div className="mt-2 space-y-2 whitespace-normal break-words">
                {e.ressalvas && <p>{e.ressalvas}</p>}
                {e.fonte_numero && <p><strong>Fonte:</strong> {e.fonte_numero}</p>}
                {!!e.candidatos?.length && (
                  <div><strong>Números citados, ainda não confirmados:</strong>
                    <ul className="mt-1 list-disc pl-4">{e.candidatos.map((c, i) => (
                      <li key={i}>{c.numero || 'Sem número'}{c.ug ? ` — UG ${c.ug}` : ''}{c.fonte ? ` (${c.fonte})` : ''}</li>
                    ))}</ul>
                  </div>
                )}
                {e.requisicao && <p>Requisição: {documento
                  ? <a href={documento} target="_blank" rel="noopener noreferrer" className="text-primary-300 underline">{e.requisicao}</a>
                  : e.requisicao}</p>}
                {e.conferido_em && <p>Data do rastreio: {e.conferido_em.split('-').reverse().join('/')}</p>}
              </div>
            </details>
          </section>
        )
      })}
    </div>
  )
}
