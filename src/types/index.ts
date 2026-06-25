// ─── Enums ───────────────────────────────────────────────────────────────────

export type StatusPregao = 'ATIVO' | 'A_VENCER' | 'VENCIDO'
export type StatusItem = 'DISPONIVEL' | 'CRITICO' | 'ESGOTADO'
export type PosFamilia = 'MASTER' | 'EQUIVALENTE'
export type StatusPedido = 'RASCUNHO' | 'CONFIRMADO' | 'CANCELADO'
export type TipoMovimentacao = 'EMPENHO' | 'ESTORNO' | 'AJUSTE'
export type CriticidadeCompra = 'CRITICO' | 'BAIXO' | 'NORMAL' | 'ALTO' | 'SEM_HIST'

// ─── Entidades base (espelham tabelas do Supabase) ───────────────────────────

export interface Fornecedor {
  id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  contato: string | null
  email: string | null
  created_at: string
}

export interface Pregao {
  id: string
  id_pncp_compra?: string
  numero_pregao: string
  objeto: string
  data_abertura: string | null
  data_vencimento: string
  valor_total: number
  valor_empenhado: number
  fornecedor_id: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  // joins
  fornecedor?: Fornecedor
  itens?: ItemPregao[]
}

export interface ItemPregao {
  id: string
  pregao_id: string
  numero_item: number
  descricao: string
  unidade: string
  quantidade_licitada: number
  quantidade_empenhada: number
  saldo_empenho: number
  valor_unitario: number
  fornecedor_id: string | null
  cd_comp_master: string | null
  status_pncp: string | null
  created_at: string
  updated_at: string
  // joins
  fornecedor?: Fornecedor
  produto?: Produto
}

export interface Produto {
  id: string
  cd_comp: string
  cd_comp_master: string | null
  pn: string | null
  mpn: string | null
  nomenclatura: string
  fabricante: string | null
  cm?: string | null
  nd: string | null
  si: string | null
  dt_aprov_cadastro: string | null
  aquisicoes: string | null
  pos_familia: PosFamilia
  mercado: string
  ativo: boolean
  preco_estimado?: number
  created_at: string
  updated_at: string
  // computed/joins
  equivalentes?: Produto[]
  estoque?: Estoque[]
}

export interface Estoque {
  id: string
  cd_comp: string
  ambiente: string
  estoque_lib: number
  estoque_res: number
  estoque_total: number
  data_referencia: string | null
  updated_at: string
}

export interface Fornecimento {
  id: string
  cd_comp: string
  cd_comp_master: string | null
  ano: number
  data: string | null
  quantidade: number
  solicitante: string | null
  ambiente: string | null
  created_at: string
}

export interface PedidoEmpenho {
  id: string
  pregao_id: string
  fornecedor_id: string
  status: StatusPedido
  valor_total: number
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  // joins
  pregao?: Pregao
  fornecedor?: Fornecedor
  itens?: ItemPedidoEmpenho[]
}

export interface ItemPedidoEmpenho {
  id: string
  pedido_id: string
  item_pregao_id: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  // joins
  item_pregao?: ItemPregao
}

export interface MovimentacaoSaldo {
  id: string
  item_pregao_id: string
  pedido_id: string | null
  tipo: TipoMovimentacao
  quantidade: number
  saldo_antes: number
  saldo_depois: number
  observacoes: string | null
  criado_em: string
}

// ─── View Models (dados enriquecidos para UI) ─────────────────────────────────

export interface PregaoCard extends Pregao {
  status: StatusPregao
  percentual_empenhado: number
  saldo_disponivel: number
  quantidade_itens: number
  itens_criticos: number
  itens_esgotados: number
  dias_para_vencer: number
}

export interface ItemPregaoEnriquecido extends ItemPregao {
  status_item: StatusItem
  percentual_saldo: number
}

export interface ProdutoMaster extends Produto {
  estoque_total_familia: number
  estoque_lib_familia: number
  qtd_equivalentes: number
  media_mensal: number
  cobertura_meses: number
}

export interface ItemCompras {
  cd_comp_master: string
  nomenclatura: string
  pn: string | null
  mpn: string | null
  nd: string | null
  si: string | null
  estoque_atual: number
  pedidos_pendentes: number
  saldo_pregoes: number
  custo_unitario_pregao: number | null
  media_mensal: number
  cobertura_meses: number
  anos_com_consumo: number
  tem_pregao_ativo: boolean
  quantidade_sugerida: number
  criticidade: CriticidadeCompra
}

export interface ItemPlanejamento {
  cd_comp_master: string
  nomenclatura: string
  pn: string | null
  mpn: string | null
  nd: string
  si: string
  nd_si: string
  quantidade_licitar: number
  estoque_atual: number
  saldo_pregoes: number
  cobertura_meses: number
  media_anual_ponderada: number
}

// ─── Carrinho ─────────────────────────────────────────────────────────────────

export interface ItemCarrinho {
  item_pregao: ItemPregao
  quantidade: number
  pregao: Pregao
  fornecedor: Fornecedor
}

export interface GrupoPedido {
  pregao: Pregao
  fornecedor: Fornecedor
  itens: ItemCarrinho[]
  valor_total: number
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

export interface FiltrosCompras {
  min_anos_consumo: 2 | 3 | 4
  media_mensal_min: 0.5 | 1 | 2 | 5
  cobertura_alvo: 6 | 12 | 18 | 24
  so_com_consumo_recorrente: boolean
  pregao_ativo?: 'TODOS' | 'SIM' | 'NAO'
  criticidade?: 'TODAS' | CriticidadeCompra
  pagina: number
  por_pagina: number
}

export interface FiltrosDiagonal {
  ano_inicio?: number
  ano_fim?: number
  status?: StatusPregao[]
}

// ─── Modificadores de Dados (overrides do planejamento) ───────────────────────

export interface ModificadorPlanejamento {
  id: string
  cd_comp_master: string
  ignorar: boolean | null
  nomenclatura_override: string | null
  media_anual_override: number | null
  preco_unitario_override: number | null
  estoque_override: number | null
  observacao: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
}

// ─── Notas de Crédito ─────────────────────────────────────────────────────────

export interface NotaCredito {
  id: string
  ptres: string
  fonte_recursos: string
  natureza_despesa: string
  ugr: string
  plano_interno: string
  si: string          // derivado automaticamente do Plano Interno via Ementário
  valor: number
  descricao: string | null
  created_at: string
  updated_at: string
}
