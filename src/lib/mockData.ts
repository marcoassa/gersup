import type { Pregao, Fornecedor, ItemPregao, Produto, Estoque, Fornecimento } from '@/types'

export const FORNECEDORES_MOCK: Fornecedor[] = []

export const PREGOES_MOCK: Pregao[] = []

export const ITENS_PREGAO_MOCK: ItemPregao[] = []

export const PRODUTOS_MOCK: Produto[] = [
  { id: 'pr1', cd_comp: 'CAP-001', cd_comp_master: 'CAP-001', pn: 'CAP-470-25-EL', mpn: 'UVZ1E471MED', nomenclatura: 'Capacitor eletrolítico 470uF 25V', fabricante: 'Nichicon', nd: '30', si: '01', dt_aprov_cadastro: '2020-01-10', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 2.50, created_at: '2020-01-10', updated_at: '2024-01-01' },
  { id: 'pr2', cd_comp: 'CAP-001-EQ1', cd_comp_master: 'CAP-001', pn: 'CAP-470-25-ELB', mpn: 'ECA1EHG471', nomenclatura: 'Capacitor eletrolítico 470uF 25V (equiv)', fabricante: 'Panasonic', nd: '30', si: '01', dt_aprov_cadastro: '2021-03-15', aquisicoes: 'MERCADO INTERNO', pos_familia: 'EQUIVALENTE', mercado: 'INTERNO', ativo: true, preco_estimado: 2.20, created_at: '2021-03-15', updated_at: '2024-01-01' },
  { id: 'pr3', cd_comp: 'RES-010', cd_comp_master: 'RES-010', pn: 'RES-10K-SMD', mpn: 'RC0805FR-0710KL', nomenclatura: 'Resistor 10kΩ 1/4W 1% SMD 0805', fabricante: 'Yageo', nd: '30', si: '01', dt_aprov_cadastro: '2019-06-20', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 0.45, created_at: '2019-06-20', updated_at: '2024-01-01' },
  { id: 'pr4', cd_comp: 'CON-026', cd_comp_master: 'CON-026', pn: 'CON-MIL-26482', mpn: 'MS3106A18-1S', nomenclatura: 'Conector circular MIL-DTL-26482 Série I', fabricante: 'Amphenol', nd: '30', si: '02', dt_aprov_cadastro: '2020-08-05', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 120.00, created_at: '2020-08-05', updated_at: '2024-01-01' },
  { id: 'pr5', cd_comp: 'FUS-005', cd_comp_master: 'FUS-005', pn: 'FUS-5A-250V', mpn: 'F5AL250V', nomenclatura: 'Fusível cerâmico 5A 250V 5x20mm', fabricante: 'Littelfuse', nd: '30', si: '01', dt_aprov_cadastro: '2019-01-01', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 1.80, created_at: '2019-01-01', updated_at: '2024-01-01' },
  { id: 'pr6', cd_comp: 'ORG-025', cd_comp_master: 'ORG-025', pn: 'ORG-NBR-25', mpn: '2-025-N70', nomenclatura: 'O-ring NBR 70 Shore A diâm. 25mm', fabricante: 'Parker', nd: '30', si: '03', dt_aprov_cadastro: '2018-05-10', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 8.50, created_at: '2018-05-10', updated_at: '2024-01-01' },
  { id: 'pr7', cd_comp: 'MAN-R2D', cd_comp_master: 'MAN-R2D', pn: 'MAN-SAE-R2-10', mpn: 'SAE100R2-10', nomenclatura: 'Mangueira hidráulica SAE 100R2 DN10', fabricante: 'Gates', nd: '30', si: '03', dt_aprov_cadastro: '2019-09-15', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 350.00, created_at: '2019-09-15', updated_at: '2024-01-01' },
  { id: 'pr8', cd_comp: 'VAL-RET', cd_comp_master: 'VAL-RET', pn: 'VAL-CK-14NPT', mpn: 'CK-400-14', nomenclatura: 'Válvula de retenção 1/4" NPT aço inox', fabricante: 'Swagelok', nd: '30', si: '03', dt_aprov_cadastro: '2020-11-20', aquisicoes: 'MERCADO INTERNO', pos_familia: 'MASTER', mercado: 'INTERNO', ativo: true, preco_estimado: 890.00, created_at: '2020-11-20', updated_at: '2024-01-01' },
]

export const ESTOQUE_MOCK: Estoque[] = [
  { id: 'e1', cd_comp: 'CAP-001', ambiente: 'CAVEX', estoque_lib: 180, estoque_res: 20, estoque_total: 200, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e2', cd_comp: 'CAP-001-EQ1', ambiente: 'CAVEX', estoque_lib: 50, estoque_res: 0, estoque_total: 50, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e3', cd_comp: 'RES-010', ambiente: 'CAVEX', estoque_lib: 15, estoque_res: 5, estoque_total: 20, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e4', cd_comp: 'CON-026', ambiente: 'CAVEX', estoque_lib: 8, estoque_res: 2, estoque_total: 10, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e5', cd_comp: 'FUS-005', ambiente: 'CAVEX', estoque_lib: 0, estoque_res: 0, estoque_total: 0, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e6', cd_comp: 'ORG-025', ambiente: 'CAVEX', estoque_lib: 320, estoque_res: 80, estoque_total: 400, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e7', cd_comp: 'MAN-R2D', ambiente: 'CAVEX', estoque_lib: 12, estoque_res: 3, estoque_total: 15, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
  { id: 'e8', cd_comp: 'VAL-RET', ambiente: 'CAVEX', estoque_lib: 3, estoque_res: 1, estoque_total: 4, data_referencia: '2025-05-01', updated_at: '2025-05-01' },
]

export const FORNECIMENTOS_MOCK: Fornecimento[] = [
  // CAP-001 - consumo alto e regular
  { id: 'fn1', cd_comp: 'CAP-001', cd_comp_master: 'CAP-001', ano: 2021, data: '2021-03-10', quantidade: 120, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2021-03-10' },
  { id: 'fn2', cd_comp: 'CAP-001', cd_comp_master: 'CAP-001', ano: 2022, data: '2022-04-15', quantidade: 145, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2022-04-15' },
  { id: 'fn3', cd_comp: 'CAP-001', cd_comp_master: 'CAP-001', ano: 2023, data: '2023-05-20', quantidade: 160, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-05-20' },
  { id: 'fn4', cd_comp: 'CAP-001', cd_comp_master: 'CAP-001', ano: 2024, data: '2024-02-28', quantidade: 180, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-02-28' },
  { id: 'fn5', cd_comp: 'CAP-001-EQ1', cd_comp_master: 'CAP-001', ano: 2023, data: '2023-08-10', quantidade: 60, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-08-10' },
  // RES-010 - consumo regular em caixas
  { id: 'fn6', cd_comp: 'RES-010', cd_comp_master: 'RES-010', ano: 2021, data: '2021-07-01', quantidade: 8, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2021-07-01' },
  { id: 'fn7', cd_comp: 'RES-010', cd_comp_master: 'RES-010', ano: 2022, data: '2022-06-10', quantidade: 10, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2022-06-10' },
  { id: 'fn8', cd_comp: 'RES-010', cd_comp_master: 'RES-010', ano: 2023, data: '2023-09-15', quantidade: 12, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-09-15' },
  { id: 'fn9', cd_comp: 'RES-010', cd_comp_master: 'RES-010', ano: 2024, data: '2024-04-20', quantidade: 14, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-04-20' },
  // CON-026 - consumo moderado
  { id: 'fn10', cd_comp: 'CON-026', cd_comp_master: 'CON-026', ano: 2022, data: '2022-02-20', quantidade: 15, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2022-02-20' },
  { id: 'fn11', cd_comp: 'CON-026', cd_comp_master: 'CON-026', ano: 2023, data: '2023-03-10', quantidade: 18, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-03-10' },
  { id: 'fn12', cd_comp: 'CON-026', cd_comp_master: 'CON-026', ano: 2024, data: '2024-01-15', quantidade: 20, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-01-15' },
  // FUS-005 - consumo alto, estoque zerado → crítico
  { id: 'fn13', cd_comp: 'FUS-005', cd_comp_master: 'FUS-005', ano: 2021, data: '2021-05-15', quantidade: 80, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2021-05-15' },
  { id: 'fn14', cd_comp: 'FUS-005', cd_comp_master: 'FUS-005', ano: 2022, data: '2022-08-20', quantidade: 90, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2022-08-20' },
  { id: 'fn15', cd_comp: 'FUS-005', cd_comp_master: 'FUS-005', ano: 2023, data: '2023-07-05', quantidade: 100, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2023-07-05' },
  { id: 'fn16', cd_comp: 'FUS-005', cd_comp_master: 'FUS-005', ano: 2024, data: '2024-03-12', quantidade: 110, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-03-12' },
  // ORG-025 - consumo alto e regular
  { id: 'fn17', cd_comp: 'ORG-025', cd_comp_master: 'ORG-025', ano: 2021, data: '2021-01-20', quantidade: 500, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2021-01-20' },
  { id: 'fn18', cd_comp: 'ORG-025', cd_comp_master: 'ORG-025', ano: 2022, data: '2022-03-10', quantidade: 550, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2022-03-10' },
  { id: 'fn19', cd_comp: 'ORG-025', cd_comp_master: 'ORG-025', ano: 2023, data: '2023-02-15', quantidade: 600, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-02-15' },
  { id: 'fn20', cd_comp: 'ORG-025', cd_comp_master: 'ORG-025', ano: 2024, data: '2024-01-30', quantidade: 620, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-01-30' },
  // VAL-RET - consumo baixo
  { id: 'fn21', cd_comp: 'VAL-RET', cd_comp_master: 'VAL-RET', ano: 2022, data: '2022-11-10', quantidade: 5, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2022-11-10' },
  { id: 'fn22', cd_comp: 'VAL-RET', cd_comp_master: 'VAL-RET', ano: 2023, data: '2023-10-20', quantidade: 6, solicitante: 'CAVEX-2', ambiente: 'CAVEX', created_at: '2023-10-20' },
  { id: 'fn23', cd_comp: 'VAL-RET', cd_comp_master: 'VAL-RET', ano: 2024, data: '2024-09-05', quantidade: 7, solicitante: 'CAVEX-1', ambiente: 'CAVEX', created_at: '2024-09-05' },
]

// ─── Helpers para montar dados com joins ─────────────────────────────────────

export function getPregaoComItens(pregaoId: string): Pregao | undefined {
  const pregao = PREGOES_MOCK.find(p => p.id === pregaoId)
  if (!pregao) return undefined
  const itens = ITENS_PREGAO_MOCK.filter(i => i.pregao_id === pregaoId)
  const fornecedor = FORNECEDORES_MOCK.find(f => f.id === pregao.fornecedor_id)
  return { ...pregao, itens, fornecedor }
}

export function getPregoesMockComItens(): Pregao[] {
  return PREGOES_MOCK.map(p => getPregaoComItens(p.id)!)
}
