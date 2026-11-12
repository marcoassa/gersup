import type { ConferenciaRecebimento } from '../types'

export function situacaoRecebimento(c: ConferenciaRecebimento, integrado: boolean, hoje = new Date()) {
  if (integrado) return { label: 'Integrado ao estoque', cor: 'text-emerald-300' }
  if (c.status === 'integrado_estoque') return { label: 'Integração desfeita após conferência', cor: 'text-amber-300' }
  if (c.status === 'sem_discriminacao') return { label: 'Recebimento sem discriminação do item', cor: 'text-amber-300' }
  if (c.status === 'recebimento_pendente') return { label: `Recebido · ${c.status_controle}`, cor: 'text-amber-300' }
  const [ano, mes, dia] = c.prazo_entrega.split('-').map(Number)
  const limite = new Date(ano, mes - 1, dia)
  const dataHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const atrasado = dataHoje > limite
  return {
    label: `${atrasado ? 'Atrasado · sem entrega vinculada' : 'Sem entrega registrada · no prazo'}${c.validacao_vinculo_pendente ? ' · confirmar vínculo da NF' : ''}`,
    cor: atrasado ? 'text-red-300' : 'text-surface-300',
  }
}
