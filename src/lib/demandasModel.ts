export const ESTADOS = { ABERTA: 'Em aberto', AGUARDANDO_PREGAO: 'Aguardando pregão', AGUARDANDO_RECURSO: 'Aguardando recurso', EMPENHADO_AGUARDANDO_ENTREGA: 'Empenhado, aguardando entrega', PARCIALMENTE_ATENDIDA: 'Parcialmente atendida', ATENDIDA: 'Atendida' }
export const ETAPAS = { A_VERIFICAR: 'A verificar', SEM_VIA: 'Sem via definida', ESPECIFICACAO: 'Aguardando especificação', PREGAO: 'Aguardando pregão', RECURSO: 'Aguardando recurso', EM_ELABORACAO: 'Pedido em elaboração', PEDIDO_FINALIZADO: 'Pedido finalizado', EMPENHADO: 'Empenhado' }
export const ENTREGAS = { A_VERIFICAR: 'A verificar', NAO_ENTREGUE: 'Não entregue (confirmado)', PARCIAL: 'Parcial', ENTREGUE: 'Entregue' }
export const PRIORIDADES = { A_DEFINIR: 'A definir', NORMAL: 'Normal', ALTA: 'Alta', URGENTE: 'Urgente' }
export type Registro = Record<string, unknown>
export const VIGENCIAS = { SIM: 'Sim', NAO: 'Não', A_VERIFICAR: 'A verificar' }
export interface PregaoDemanda { pregao: string; item: string; vigencia_final: string; item_id?: string }
export const hojeLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export function referenciasVigentes(d: Pick<Demanda, 'pregoes_vigentes'>, hoje = hojeLocal()) { return (d.pregoes_vigentes || []).filter(r => r.pregao && r.item && r.vigencia_final >= hoje) }
export function vigenciaEfetiva(d: Pick<Demanda, 'pregao_vigencia' | 'pregoes_vigentes'>, hoje = hojeLocal()): keyof typeof VIGENCIAS { return d.pregao_vigencia === 'SIM' ? (referenciasVigentes(d, hoje).length ? 'SIM' : 'NAO') : d.pregao_vigencia || 'A_VERIFICAR' }
export interface Demanda {
 quantidade_atual: string; pregao_vigencia: keyof typeof VIGENCIAS; pregoes_vigentes: PregaoDemanda[]
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
 if (!(d.estado_demanda in ESTADOS)) return 'Selecione uma situação válida.'
 if (d.pregao_vigencia === 'SIM' && (!(d.pregoes_vigentes || []).length || d.pregoes_vigentes.some(r => !r.pregao.trim() || !r.item.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.vigencia_final) || r.vigencia_final < hojeLocal()))) return 'Informe pregão, item e uma data de vigência válida para cada referência.'
 if (!d.descricao.trim()) return 'Informe a descrição.'
 if (d.entrega !== 'A_VERIFICAR' && !d.evidencia_entrega.trim()) return 'Informe a evidência da situação de entrega.'
 if (['ATENDIDA', 'PARCIALMENTE_ATENDIDA'].includes(d.estado_demanda) && !d.justificativa.trim()) return 'Informe a evidência do atendimento integral ou parcial.'
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
 const { grupo, quantidade_atual, pregao_vigencia, pregoes_vigentes, descricao, requisitante, cm, pn, mpn, estado_demanda, etapa_compra, entrega, evidencia_entrega, prioridade, data_necessidade, responsavel, proxima_acao, observacoes, pendencias, revisao, justificativa } = d
 return { grupo, quantidade_atual, pregao_vigencia, pregoes_vigentes, descricao, requisitante, cm, pn, mpn, estado_demanda, etapa_compra, entrega, evidencia_entrega, prioridade, data_necessidade: data_necessidade || null, responsavel, proxima_acao, observacoes, pendencias, revisao, justificativa }
}

