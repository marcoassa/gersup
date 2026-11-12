import type { ItemPedidoCompra } from '../types'
import { situacaoRecebimento } from '../lib/recebimentoItem'

const data = (iso: string) => iso.split('-').reverse().join('/')

export function RecebimentoItem({ item }: { item: ItemPedidoCompra }) {
  const conferencias = (item.empenhos_sped ?? []).filter(e => e.recebimento_controle)
  if (!conferencias.length) return <span className="text-[10px] text-surface-300">{item.entregue_em ? 'Integrado ao estoque' : 'Entrega pendente'}</span>
  return <div className="min-w-[230px] max-w-[380px] space-y-2 text-left text-[11px]">
    {conferencias.map((e, index) => {
      const c = e.recebimento_controle!
      const situacao = situacaoRecebimento(c, !!item.entregue_em)
      return <section key={`${e.numero}-${index}`} className="space-y-1">
        <p className={`font-semibold ${situacao.cor}`}>{situacao.label}</p>
        <p className="text-surface-400">Prazo: {data(c.prazo_entrega)} · conferência: {data(c.conferido_em)}</p>
        {(c.validacao_vinculo_pendente || c.status === 'sem_discriminacao') && <p className="text-amber-300">{c.ressalvas.find(r => r.startsWith('Possível') || r.startsWith('Há registro'))}</p>}
        <details className="text-surface-300">
          <summary className="cursor-pointer text-primary-300">Recebimentos e ressalvas</summary>
          <div className="mt-2 space-y-2">
            {[...c.recebimentos, ...c.recebimentos_sem_discriminacao].map(r => <p key={`${r.line}-${r.nf}`}>
              <a href={`https://docs.google.com/spreadsheets/d/11U9vWhAGyVx9DHp3zYENLW0UXxgLsJoTWIaYP9OUujY/edit#gid=0&range=A${r.line}:N${r.line}`} target="_blank" rel="noopener noreferrer" className="text-primary-300 underline">NF {r.nf} · linha {r.line}</a><br />
              Chegada: {r.date} · {r.status}<br />Controle: {r.controle || 'Não informado'}
              {r.obs && <><br />{r.obs}</>}
            </p>)}
            {c.ressalvas.map((r, i) => <p key={i}>{r}</p>)}
            <p>Referência da NE: {data(c.data_referencia_ne)}. {c.origem_data_ne}. Prazo: {c.regra_prazo}.</p>
            <p>A data de chegada não informa a data de integração ao estoque.</p>
          </div>
        </details>
      </section>
    })}
  </div>
}
