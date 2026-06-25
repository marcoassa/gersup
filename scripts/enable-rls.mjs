import pkg from 'pg'
const { Client } = pkg

const client = new Client({
  connectionString: 'postgresql://postgres:56BvwCaTqkfwUBA2@db.axuvwfkhauoizforekxi.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

// Habilita acesso de leitura pública para todas as tabelas de dados
const SQL = `
-- Habilitar RLS em todas as tabelas
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pregao ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_empenho ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido_empenho ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Políticas de LEITURA pública (anon pode ler tudo por enquanto)
DO $$ BEGIN
  DROP POLICY IF EXISTS "allow_anon_read_fornecedores"  ON fornecedores;
  DROP POLICY IF EXISTS "allow_anon_read_pregoes"       ON pregoes;
  DROP POLICY IF EXISTS "allow_anon_read_itens_pregao"  ON itens_pregao;
  DROP POLICY IF EXISTS "allow_anon_read_produtos"      ON produtos;
  DROP POLICY IF EXISTS "allow_anon_read_estoque"       ON estoque;
  DROP POLICY IF EXISTS "allow_anon_read_fornecimentos" ON fornecimentos;
  DROP POLICY IF EXISTS "allow_anon_update_pregoes"     ON pregoes;
  DROP POLICY IF EXISTS "allow_anon_update_itens"       ON itens_pregao;
END $$;

CREATE POLICY "allow_anon_read_fornecedores"  ON fornecedores    FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_read_pregoes"       ON pregoes         FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_read_itens_pregao"  ON itens_pregao    FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_read_produtos"      ON produtos        FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_read_estoque"       ON estoque         FOR SELECT TO anon USING (true);
CREATE POLICY "allow_anon_read_fornecimentos" ON fornecimentos   FOR SELECT TO anon USING (true);

-- Escrita: pregoes e itens (edição inline no app)
CREATE POLICY "allow_anon_update_pregoes" ON pregoes      FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_update_itens"   ON itens_pregao FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Escrita completa: produtos, estoque, fornecimentos (necessário para importação de dados)
DO $$ BEGIN
  DROP POLICY IF EXISTS "allow_anon_write_produtos"      ON produtos;
  DROP POLICY IF EXISTS "allow_anon_write_estoque"       ON estoque;
  DROP POLICY IF EXISTS "allow_anon_write_fornecimentos" ON fornecimentos;
END $$;

CREATE POLICY "allow_anon_write_produtos" ON produtos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_write_estoque" ON estoque
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_write_fornecimentos" ON fornecimentos
  FOR ALL TO anon USING (true) WITH CHECK (true);
`

async function run() {
  console.log('🔌 Conectando...')
  await client.connect()
  console.log('✅ Aplicando políticas RLS...\n')
  try {
    await client.query(SQL)
    console.log('✅ RLS configurado! Acesso público de leitura habilitado.')
  } catch (err) {
    console.error('❌ Erro:', err.message)
  } finally {
    await client.end()
  }
}

run()
