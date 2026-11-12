export const ESTADOS = { A_VALIDAR: 'A validar', ABERTA: 'Aberta', PARCIALMENTE_ATENDIDA: 'Parcialmente atendida', ATENDIDA: 'Atendida', CANCELADA: 'Cancelada' }
export const ETAPAS = { A_VERIFICAR: 'A verificar', SEM_VIA: 'Sem via definida', ESPECIFICACAO: 'Aguardando especificação', PREGAO: 'Aguardando pregão', RECURSO: 'Aguardando recurso', EM_ELABORACAO: 'Pedido em elaboração', PEDIDO_FINALIZADO: 'Pedido finalizado', EMPENHADO: 'Empenhado' }
export const ENTREGAS = { A_VERIFICAR: 'A verificar', NAO_ENTREGUE: 'Não entregue (confirmado)', PARCIAL: 'Parcial', ENTREGUE: 'Entregue' }
export const PRIORIDADES = { A_DEFINIR: 'A definir', NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' }
export type Registro = Record<string, unknown>
export interface Demanda {
 id: string; codigo: string; grupo: string; descricao: string; requisitante: string; quantidade_original: string
 cm: string; pn: string; mpn: string; situacao_fonte: string
 estado_demanda: keyof typeof ESTADOS; etapa_compra: keyof typeof ETAPAS; entrega: keyof typeof ENTREGAS
 evidencia_entrega: string; prioridade: keyof typeof PRIORIDADES; data_necessidade: string | null
 responsavel: string; proxima_acao: string; observacoes: string; pendencias: string; revisao: 'PENDENTE' | 'VALIDADA'
 justificativa: string; dados_origem: Registro; versao: number; atualizado_em: string
}
export interface Atendimento {
 item?: Registro | null; estoque?: Registro | null
 id: string; demanda_id: string; tipo: 'COMPRA' | 'ESTOQUE'; item_pedido_id: string | null; estoque_id: string | null
 quantidade_prevista: number; quantidade_recebida: number; quantidade_destinada: number; unidade: string
 data_recebimento: string | null; evidencia: string; observacoes: string; ativo: boolean; versao: number
}
export type AtendimentoInput = Omit<Atendimento, 'id' | 'versao'>
export interface Historico { id: number; ocorrido_em: string; operacao: string; antes: Registro | null; depois: Registro; autor: string | null }
export const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export const texto = (v: unknown): string => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
export function registros(v: unknown): Registro[] { return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Registro[] : [] }
export function safeLink(v: unknown): string | undefined {
 try { const url = new URL(texto(v)); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
export function buscaDemanda(d: Demanda, termo: string) { return normalize(JSON.stringify(d)).includes(normalize(termo.trim())) }
export function validarDemanda(d: Demanda): string | null {
 if (!d.descricao.trim()) return 'Informe a descrição.'
 if (d.entrega !== 'A_VERIFICAR' && !d.evidencia_entrega.trim()) return 'Informe a evidência da situação de entrega.'
 if (['ATENDIDA', 'CANCELADA'].includes(d.estado_demanda) && !d.justificativa.trim()) return 'Justifique o atendimento ou cancelamento.'
 if (d.revisao === 'VALIDADA' && d.pendencias.trim()) return 'Resolva ou retire as pendências antes de marcar a revisão como validada. O histórico preservará o texto anterior.'
 return null
}
export function validarAtendimento(a: AtendimentoInput): string | null {
 if (a.tipo === 'COMPRA' ? !a.item_pedido_id || !!a.estoque_id : !a.estoque_id || !!a.item_pedido_id) return 'Selecione a origem do atendimento.'
 if (![a.quantidade_prevista, a.quantidade_recebida, a.quantidade_destinada].every(Number.isFinite) || a.quantidade_prevista <= 0 || a.quantidade_recebida < 0 || a.quantidade_destinada < 0 || a.quantidade_recebida > a.quantidade_prevista || a.quantidade_destinada > a.quantidade_recebida) return 'Use quantidades válidas: destinada ≤ recebida ≤ prevista; prevista deve ser maior que zero.'
 if (!a.unidade.trim()) return 'Informe a unidade, após conferir a conversão da embalagem.'
 if (a.quantidade_recebida > 0 && (!a.data_recebimento || !a.evidencia.trim())) return 'Recebimento exige data e evidência.'
 if (!a.ativo && !a.observacoes.trim()) return 'Informe o motivo da desativação do vínculo.'
 return null
}
export function camposEditaveis(d: Demanda) {
 const { descricao, requisitante, cm, pn, mpn, estado_demanda, etapa_compra, entrega, evidencia_entrega, prioridade, data_necessidade, responsavel, proxima_acao, observacoes, pendencias, revisao, justificativa } = d
 return { descricao, requisitante, cm, pn, mpn, estado_demanda, etapa_compra, entrega, evidencia_entrega, prioridade, data_necessidade: data_necessidade || null, responsavel, proxima_acao, observacoes, pendencias, revisao, justificativa }
}
