-- ================================================================
-- GERSUP — Row Level Security (RLS)
-- Execute no SQL Editor do painel Supabase
-- Garante que apenas usuários autenticados acessam os dados
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. Habilitar RLS em todas as tabelas
-- ────────────────────────────────────────────────────────────────
ALTER TABLE fornecedores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pregao          ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque               ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecimentos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_empenho       ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido_empenho  ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_saldo   ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- 2. Remover políticas antigas (se existirem) para recriar limpas
-- ────────────────────────────────────────────────────────────────
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────
-- 3. Criar políticas: somente usuários autenticados têm acesso
-- ────────────────────────────────────────────────────────────────

-- fornecedores
CREATE POLICY "auth_select_fornecedores"   ON fornecedores  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_fornecedores"   ON fornecedores  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_fornecedores"   ON fornecedores  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_fornecedores"   ON fornecedores  FOR DELETE USING (auth.role() = 'authenticated');

-- users
CREATE POLICY "auth_select_users"          ON users         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_users"          ON users         FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_users"          ON users         FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_users"          ON users         FOR DELETE USING (auth.role() = 'authenticated');

-- pregoes
CREATE POLICY "auth_select_pregoes"        ON pregoes       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_pregoes"        ON pregoes       FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_pregoes"        ON pregoes       FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_pregoes"        ON pregoes       FOR DELETE USING (auth.role() = 'authenticated');

-- itens_pregao
CREATE POLICY "auth_select_itens_pregao"   ON itens_pregao  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_itens_pregao"   ON itens_pregao  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_itens_pregao"   ON itens_pregao  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_itens_pregao"   ON itens_pregao  FOR DELETE USING (auth.role() = 'authenticated');

-- produtos
CREATE POLICY "auth_select_produtos"       ON produtos      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_produtos"       ON produtos      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_produtos"       ON produtos      FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_produtos"       ON produtos      FOR DELETE USING (auth.role() = 'authenticated');

-- estoque
CREATE POLICY "auth_select_estoque"        ON estoque       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_estoque"        ON estoque       FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_estoque"        ON estoque       FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_estoque"        ON estoque       FOR DELETE USING (auth.role() = 'authenticated');

-- fornecimentos
CREATE POLICY "auth_select_fornecimentos"  ON fornecimentos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_fornecimentos"  ON fornecimentos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_fornecimentos"  ON fornecimentos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_fornecimentos"  ON fornecimentos FOR DELETE USING (auth.role() = 'authenticated');

-- pedidos_empenho
CREATE POLICY "auth_select_pedidos"        ON pedidos_empenho      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_pedidos"        ON pedidos_empenho      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_pedidos"        ON pedidos_empenho      FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_pedidos"        ON pedidos_empenho      FOR DELETE USING (auth.role() = 'authenticated');

-- itens_pedido_empenho
CREATE POLICY "auth_select_itens_pedido"   ON itens_pedido_empenho FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_itens_pedido"   ON itens_pedido_empenho FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_itens_pedido"   ON itens_pedido_empenho FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_itens_pedido"   ON itens_pedido_empenho FOR DELETE USING (auth.role() = 'authenticated');

-- movimentacoes_saldo
CREATE POLICY "auth_select_movimentacoes"  ON movimentacoes_saldo  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_movimentacoes"  ON movimentacoes_saldo  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_movimentacoes"  ON movimentacoes_saldo  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_movimentacoes"  ON movimentacoes_saldo  FOR DELETE USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────────
-- 4. Verificação: listar políticas criadas
-- ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
