import test from 'node:test'
import assert from 'node:assert/strict'
import { situacaoRecebimento } from '../src/lib/recebimentoItem'
import type { ConferenciaRecebimento } from '../src/types'

const base: ConferenciaRecebimento = {
  status: 'sem_registro', status_controle: '', conferido_em: '2026-11-12',
  data_referencia_ne: '2026-07-16', origem_data_ne: 'INCLUSAO', prazo_entrega: '2026-10-01',
  regra_prazo: '2 meses + 15 dias', fonte_url: '', recebimentos: [], recebimentos_sem_discriminacao: [],
  ressalvas: [], validacao_vinculo_pendente: false,
}
test('prazo vence após o fim do dia-limite local', () => {
  assert.match(situacaoRecebimento(base, false, new Date(2026, 9, 1, 23, 59)).label, /no prazo/)
  assert.match(situacaoRecebimento(base, false, new Date(2026, 9, 2)).label, /Atrasado/)
})
test('recebimento pendente e sem discriminação não viram falta de entrega vencida', () => {
  assert.match(situacaoRecebimento({ ...base, status: 'recebimento_pendente', status_controle: 'PANE' }, false).label, /Recebido.*PANE/)
  assert.match(situacaoRecebimento({ ...base, status: 'sem_discriminacao' }, false).label, /sem discriminação/)
})
test('ressalva AVEX permanece no alerta e integração manual prevalece sobre fotografia antiga', () => {
  assert.match(situacaoRecebimento({ ...base, validacao_vinculo_pendente: true }, false, new Date(2026, 10, 12)).label, /confirmar vínculo da NF/)
  assert.equal(situacaoRecebimento(base, true).label, 'Integrado ao estoque')
  assert.match(situacaoRecebimento({ ...base, status: 'integrado_estoque' }, false).label, /desfeita/)
})
