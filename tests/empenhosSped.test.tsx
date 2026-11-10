import React from 'react'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmpenhosSpedItem } from '../src/components/EmpenhosSpedItem'
import { linkSped, situacaoEmpenho, textoBuscaEmpenhos } from '../src/lib/empenhosSped'
import type { EmpenhoSped } from '../src/types'

const example: EmpenhoSped = {
  numero: '2026NE000001', nup: '00000.000001/2026-00', ug: '000001',
  processo_url: 'http://sped.bavt.eb.mil.br/#/manter-processo/visualizar/1',
  status: 'numero_identificado_no_historico',
}

test('exibe NE, NUP de aquisição e link seguro para cada processo do item', () => {
  const html = renderToStaticMarkup(<EmpenhosSpedItem item={{ empenhos_sped: [example, { ...example, numero: '2026NE000002', nup: '00000.000002/2026-00' }] }} />)
  assert.match(html, /2026NE000001/)
  assert.match(html, /2026NE000002/)
  assert.match(html, /00000\.000001\/2026-00/)
  assert.match(html, /00000\.000002\/2026-00/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /Número identificado/)
})

test('preserva NUP sem NE e distingue candidatos conflitantes', () => {
  const html = renderToStaticMarkup(<EmpenhosSpedItem item={{ empenhos_sped: [{ ...example, numero: null, status: 'pendente_conflito_numero_e_ug', candidatos: [{ numero: '2026NE000003', ug: '000002' }] }] }} />)
  assert.match(html, /Empenho não definido/)
  assert.match(html, /00000\.000001\/2026-00/)
  assert.match(html, /Pendente: conflito/)
  assert.match(html, /ainda não confirmados/)
  assert.match(html, /2026NE000003/)
  assert.doesNotMatch(html, /Número identificado/)
})

test('dados ausentes, status desconhecido e número preexistente não viram confirmação', () => {
  for (const empenhos_sped of [undefined, null, []]) {
    assert.match(renderToStaticMarkup(<EmpenhosSpedItem item={{ empenhos_sped }} />), /Rastreio não informado/)
  }
  assert.equal(situacaoEmpenho({ ...example, status: 'novo_status' }).pendente, true)
  assert.equal(situacaoEmpenho({ ...example, status: 'numero_preexistente_pendente_confirmacao_sped' }).pendente, true)
  assert.equal(situacaoEmpenho({ ...example, numero: null }).pendente, true)
})

test('busca inclui empenho, NUP, UG, candidatos e pendência', () => {
  const text = textoBuscaEmpenhos({ empenhos_sped: [{ ...example, status: 'correlacao_com_divergencia_quantidade', candidatos: [{ numero: '2026NE000003' }] }] })
  for (const value of [example.numero!, example.nup!, example.ug!, '2026NE000003', 'Pendente']) assert.ok(text.includes(value))
})

test('links fora do SPED, credenciais e scripts são rejeitados; texto é escapado', () => {
  for (const url of ['javascript:alert(1)', 'https://example.com/', 'http://sped.bavt.eb.mil.br.evil.test/#/manter-processo/visualizar/1', 'http://user@sped.bavt.eb.mil.br/#/manter-processo/visualizar/1']) assert.equal(linkSped(url), null)
  const html = renderToStaticMarkup(<EmpenhosSpedItem item={{ empenhos_sped: [{ ...example, processo_url: 'javascript:alert(1)', ressalvas: '<script>alert(1)</script>' }] }} />)
  assert.doesNotMatch(html, /href=|<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /sem link/)
})
