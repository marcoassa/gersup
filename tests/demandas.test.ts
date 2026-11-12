import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscaDemanda, camposEditaveis, safeLink, validarAtendimento, validarDemanda } from '../src/lib/demandasModel'
import type { Demanda, AtendimentoInput } from '../src/lib/demandasModel'

const demanda = { id: 'example', codigo: 'DEM-0001', descricao: 'Material de revisão', requisitante: 'Oficina', quantidade_original: '1 kit', cm: '123', pn: '', mpn: '', grupo: 'Exemplo', situacao_fonte: 'Concluído segundo anotação', estado_demanda: 'A_VALIDAR', etapa_compra: 'A_VERIFICAR', entrega: 'A_VERIFICAR', evidencia_entrega: '', prioridade: 'A_DEFINIR', data_necessidade: null, responsavel: '', proxima_acao: '', observacoes: '', pendencias: '', revisao: 'PENDENTE', justificativa: '', dados_origem: { termos_busca_pedidos: '#0016', compras_candidatas: [{ empenhos: [{ numero: '2026NE001234' }] }] }, versao: 1, atualizado_em: '' } satisfies Demanda
test('conclusão anotada não altera entrega e referências são pesquisáveis', () => {
 assert.equal(validarDemanda(demanda), null)
 assert.equal(camposEditaveis(demanda).entrega, 'A_VERIFICAR')
 assert.ok(buscaDemanda(demanda, 'REVISAO'))
 assert.ok(buscaDemanda(demanda, '#0016'))
 assert.ok(buscaDemanda(demanda, '2026NE001234'))
 assert.ok(!buscaDemanda(demanda, 'ausente'))
})
test('edição preserva dados de origem, propriedade e versão', () => {
 const allowed = camposEditaveis(demanda)
 for (const key of ['dados_origem','owner_id','codigo','situacao_fonte','quantidade_original','versao']) assert.ok(!(key in allowed))
})
test('confirmação de entrega e encerramento exigem evidência', () => {
 assert.match(validarDemanda({ ...demanda, entrega: 'ENTREGUE' })!, /evidência/)
 assert.match(validarDemanda({ ...demanda, entrega: 'NAO_ENTREGUE' })!, /evidência/)
 assert.match(validarDemanda({ ...demanda, estado_demanda: 'ATENDIDA' })!, /Justifique/)
 assert.match(validarDemanda({ ...demanda, revisao: 'VALIDADA', pendencias: 'CM divergente' })!, /pendências/)
})
const a: AtendimentoInput = { demanda_id: 'example', tipo: 'COMPRA', item_pedido_id: 'item', estoque_id: null, quantidade_prevista: 10, quantidade_recebida: 0, quantidade_destinada: 0, unidade: 'un', data_recebimento: null, evidencia: '', observacoes: '', ativo: true }
test('atendimento parcial valida origem, quantidades e evidências', () => {
 assert.equal(validarAtendimento(a), null)
 assert.ok(validarAtendimento({ ...a, quantidade_recebida: 11 }))
 assert.ok(validarAtendimento({ ...a, quantidade_destinada: 1 }))
 assert.ok(validarAtendimento({ ...a, quantidade_prevista: NaN }))
 assert.ok(validarAtendimento({ ...a, estoque_id: 'estoque' }))
 assert.ok(validarAtendimento({ ...a, quantidade_recebida: 1 }))
 assert.equal(validarAtendimento({ ...a, quantidade_recebida: 3, quantidade_destinada: 2, evidencia: 'Conferência', data_recebimento: '2026-11-12' }), null)
 assert.ok(validarAtendimento({ ...a, ativo: false }))
})
test('fontes rejeitam URLs executáveis e referências locais', () => {
 assert.equal(safeLink('javascript:alert(1)'), undefined)
 assert.equal(safeLink('file:///C:/private.pdf'), undefined)
 assert.equal(safeLink('https://drive.google.com/file/d/example/view'), 'https://drive.google.com/file/d/example/view')
})
