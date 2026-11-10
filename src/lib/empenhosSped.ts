import type { EmpenhoSped, ItemPedidoCompra } from '../types'

const identificados = new Set([
  'numero_identificado_no_historico',
  'numero_identificado_no_historico_e_nome_do_anexo',
  'numero_confirmado_por_nup_do_pedido_e_historico',
])

const pendencias: Record<string, string> = {
  correlacao_com_divergencia_quantidade: 'Pendente: quantidade divergente',
  correlacao_com_divergencia_valor: 'Pendente: valor divergente',
  correlacao_pendente_divergencia_quantidade_e_cnpj: 'Pendente: quantidade e CNPJ',
  correlacao_pendente_divergencia_quantidade_e_valor: 'Pendente: quantidade e valor',
  numero_preexistente_pendente_confirmacao_sped: 'Pendente: confirmar número no SPED',
  pendente_conflito_numero_e_ug: 'Pendente: conflito de empenho / UG',
  processo_arquivado_sem_empenho_identificado: 'Pendente: arquivado sem empenho identificado',
  sem_correspondencia_segura_no_sped: 'Pendente: sem correspondência segura',
}

export function getEmpenhosSped(item: Pick<ItemPedidoCompra, 'empenhos_sped'>): EmpenhoSped[] {
  return Array.isArray(item.empenhos_sped)
    ? item.empenhos_sped.filter(e => e && typeof e === 'object' && !Array.isArray(e))
    : []
}

export function situacaoEmpenho(e: EmpenhoSped) {
  if (e.numero && identificados.has(e.status ?? '')) {
    return { pendente: false, label: 'Número identificado' }
  }
  return { pendente: true, label: pendencias[e.status ?? ''] ?? 'Pendente: verificar rastreio' }
}

/** Aceita somente links das peças e processos no SPED interno conhecido. */
export function linkSped(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
      && url.hostname === 'sped.bavt.eb.mil.br'
      && !url.username && !url.password && !url.port && !url.search
      && url.pathname === '/'
      && /^#\/(manter-processo\/visualizar|detalhe-documentos)\/\d+$/.test(url.hash)
      ? url.href : null
  } catch {
    return null
  }
}

export function textoBuscaEmpenhos(item: Pick<ItemPedidoCompra, 'empenhos_sped'>): string {
  return getEmpenhosSped(item).map(e => [
    e.numero, e.nup, e.ug, e.requisicao, situacaoEmpenho(e).label,
    ...(e.candidatos ?? []).flatMap(c => [c.numero, c.ug]),
  ].filter(Boolean).join(' ')).join(' ')
}
