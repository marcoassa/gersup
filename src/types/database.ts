// Placeholder - será gerado automaticamente pelo Supabase CLI após criar as tabelas
// Execute: npx supabase gen types typescript --project-id <seu-project-id> > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      fornecedores: {
        Row: {
          id: string
          cnpj: string
          razao_social: string
          nome_fantasia: string | null
          contato: string | null
          email: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['fornecedores']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['fornecedores']['Insert']>
      }
      pregoes: {
        Row: {
          id: string
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
        }
        Insert: Omit<Database['public']['Tables']['pregoes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['pregoes']['Insert']>
      }
      itens_pregao: {
        Row: {
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
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['itens_pregao']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['itens_pregao']['Insert']>
      }
      produtos: {
        Row: {
          id: string
          cd_comp: string
          cd_comp_master: string | null
          pn: string | null
          mpn: string | null
          nomenclatura: string
          fabricante: string | null
          nd: string | null
          si: string | null
          dt_aprov_cadastro: string | null
          aquisicoes: string | null
          pos_familia: string
          mercado: string
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['produtos']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['produtos']['Insert']>
      }
      estoque: {
        Row: {
          id: string
          cd_comp: string
          ambiente: string
          estoque_lib: number
          estoque_res: number
          estoque_total: number
          data_referencia: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['estoque']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['estoque']['Insert']>
      }
      fornecimentos: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['fornecimentos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['fornecimentos']['Insert']>
      }
      pedidos_empenho: {
        Row: {
          id: string
          pregao_id: string
          fornecedor_id: string
          status: string
          valor_total: number
          observacoes: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: Omit<Database['public']['Tables']['pedidos_empenho']['Row'], 'id' | 'criado_em' | 'atualizado_em'>
        Update: Partial<Database['public']['Tables']['pedidos_empenho']['Insert']>
      }
      itens_pedido_empenho: {
        Row: {
          id: string
          pedido_id: string
          item_pregao_id: string
          quantidade: number
          valor_unitario: number
          valor_total: number
        }
        Insert: Omit<Database['public']['Tables']['itens_pedido_empenho']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['itens_pedido_empenho']['Insert']>
      }
      movimentacoes_saldo: {
        Row: {
          id: string
          item_pregao_id: string
          pedido_id: string | null
          tipo: string
          quantidade: number
          saldo_antes: number
          saldo_depois: number
          observacoes: string | null
          criado_em: string
        }
        Insert: Omit<Database['public']['Tables']['movimentacoes_saldo']['Row'], 'id' | 'criado_em'>
        Update: Partial<Database['public']['Tables']['movimentacoes_saldo']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
