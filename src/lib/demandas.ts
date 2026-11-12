import { supabase } from './supabase'
import { camposEditaveis, validarAtendimento, validarDemanda } from './demandasModel'
import type { Demanda, Atendimento, AtendimentoInput, Historico, Registro } from './demandasModel'

export async function listarDemandas(): Promise<Demanda[]> {
 const rows: Demanda[] = []
 for (let start = 0; ; start += 500) {
  const { data, error } = await supabase.from('demandas').select('*').order('codigo').range(start, start + 499)
  if (error) throw error
  rows.push(...data as Demanda[])
  if (data.length < 500) return rows
 }
}
export async function salvarDemanda(d: Demanda): Promise<Demanda> {
 const invalid = validarDemanda(d); if (invalid) throw new Error(invalid)
 const { data, error } = await supabase.from('demandas').update(camposEditaveis(d)).eq('id', d.id).eq('versao', d.versao).select('*').maybeSingle()
 if (error) throw error
 if (!data) throw new Error('Este registro foi alterado em outra sessão ou não está acessível. Feche e atualize a lista antes de editar novamente.')
 return data as Demanda
}
export async function criarDemanda(descricao: string, requisitante: string, grupo: string, quantidade: string): Promise<Demanda> {
 const codigo = `DEM-N-${crypto.randomUUID()}`
 const { data, error } = await supabase.from('demandas').insert({ codigo, descricao, requisitante, grupo, quantidade_original: quantidade, proxima_acao: 'Validar especificação, quantidade e via de atendimento.', dados_origem: { origem: 'Cadastro manual', descricao, requisitante, quantidade } }).select('*').single()
 if (error) throw error
 return data as Demanda
}
export async function detalheDemanda(id: string) {
 const [a, h] = await Promise.all([
  supabase.from('demandas_atendimentos').select('*,item:itens_pedido_compra(numero_pregao,numero_item,nomenclatura,pedidos_compra(numero)),estoque:estoque(cd_comp,ambiente)').eq('demanda_id', id).order('criado_em'),
  supabase.from('demandas_historico').select('*').eq('demanda_id', id).order('ocorrido_em', { ascending: false }).limit(100),
 ])
 if (a.error) throw a.error
 if (h.error) throw h.error
 return { atendimentos: a.data as Atendimento[], historico: h.data as Historico[] }
}
export async function salvarAtendimento(a: AtendimentoInput, existing?: Atendimento) {
 const invalid = validarAtendimento(a); if (invalid) throw new Error(invalid)
 let result
 if (existing) {
  const { quantidade_prevista, quantidade_recebida, quantidade_destinada, unidade, data_recebimento, evidencia, observacoes, ativo } = a
  result = await supabase.from('demandas_atendimentos').update({ quantidade_prevista, quantidade_recebida, quantidade_destinada, unidade, data_recebimento: data_recebimento || null, evidencia, observacoes, ativo }).eq('id', existing.id).eq('versao', existing.versao).select('*').maybeSingle()
 } else result = await supabase.from('demandas_atendimentos').insert({ ...a, data_recebimento: a.data_recebimento || null }).select('*').single()
 if (result.error) throw result.error
 if (!result.data) throw new Error('Vínculo alterado em outra sessão. Atualize os detalhes antes de tentar novamente.')
}
export async function opcoesCompra(): Promise<Registro[]> {
 const { data, error } = await supabase.from('itens_pedido_compra').select('id,pedido_id,numero_pregao,numero_item,nomenclatura,quantidade,pedidos_compra(numero)').order('numero_pregao').limit(1000)
 if (error) throw error
 return data as Registro[]
}
export async function buscarEstoque(termo: string): Promise<Registro[]> {
 // Search by the component code, never interpolate raw PostgREST filter expressions.
 if (!/^[\w-]+$/.test(termo.trim())) throw new Error('Informe o código de componente do estoque (números, letras ou hífen).')
 const { data, error } = await supabase.from('estoque').select('id,cd_comp,ambiente,estoque_lib,data_referencia').eq('cd_comp', termo.trim()).limit(100)
 if (error) throw error
 return data as Registro[]
}
