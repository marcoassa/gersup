import pkg from 'pg'
const { Client } = pkg

const client = new Client({
  connectionString: 'postgresql://postgres:56BvwCaTqkfwUBA2@db.axuvwfkhauoizforekxi.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS fornecedores (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cnpj          TEXT NOT NULL UNIQUE,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  contato       TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'VIEWER',
  password_hash TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pregoes (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero_pregao   TEXT NOT NULL UNIQUE,
  objeto          TEXT NOT NULL,
  data_abertura   DATE,
  data_vencimento DATE NOT NULL,
  valor_total     NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_empenhado NUMERIC(15,2) NOT NULL DEFAULT 0,
  fornecedor_id   UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pregao (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pregao_id            UUID NOT NULL REFERENCES pregoes(id) ON DELETE CASCADE,
  numero_item          INTEGER NOT NULL,
  descricao            TEXT NOT NULL,
  unidade              TEXT NOT NULL DEFAULT 'UN',
  quantidade_licitada  NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_empenhada NUMERIC(12,4) NOT NULL DEFAULT 0,
  saldo_empenho        NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor_unitario       NUMERIC(15,4) NOT NULL DEFAULT 0,
  fornecedor_id        UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  cd_comp_master       TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pregao_id, numero_item)
);

CREATE TABLE IF NOT EXISTS produtos (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cd_comp           TEXT NOT NULL UNIQUE,
  cd_comp_master    TEXT,
  pn                TEXT,
  mpn               TEXT,
  nomenclatura      TEXT NOT NULL,
  fabricante        TEXT,
  nd                TEXT,
  si                TEXT,
  dt_aprov_cadastro DATE,
  aquisicoes        TEXT,
  pos_familia       TEXT NOT NULL DEFAULT 'MASTER' CHECK (pos_familia IN ('MASTER','EQUIVALENTE')),
  mercado           TEXT NOT NULL DEFAULT 'INTERNO',
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_master ON produtos(cd_comp_master);
CREATE INDEX IF NOT EXISTS idx_produtos_nd_si ON produtos(nd, si);

CREATE TABLE IF NOT EXISTS estoque (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cd_comp          TEXT NOT NULL,
  ambiente         TEXT NOT NULL,
  estoque_lib      NUMERIC(12,4) NOT NULL DEFAULT 0,
  estoque_res      NUMERIC(12,4) NOT NULL DEFAULT 0,
  estoque_total    NUMERIC(12,4) NOT NULL DEFAULT 0,
  data_referencia  DATE,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cd_comp, ambiente)
);

CREATE INDEX IF NOT EXISTS idx_estoque_cd_comp ON estoque(cd_comp);
CREATE INDEX IF NOT EXISTS idx_estoque_ambiente ON estoque(ambiente);

CREATE TABLE IF NOT EXISTS fornecimentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cd_comp         TEXT NOT NULL,
  cd_comp_master  TEXT,
  ano             INTEGER NOT NULL,
  data            DATE,
  quantidade      NUMERIC(12,4) NOT NULL DEFAULT 0,
  solicitante     TEXT,
  ambiente        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fornecimentos_cd_comp ON fornecimentos(cd_comp);
CREATE INDEX IF NOT EXISTS idx_fornecimentos_master ON fornecimentos(cd_comp_master);
CREATE INDEX IF NOT EXISTS idx_fornecimentos_ano ON fornecimentos(ano);

CREATE TABLE IF NOT EXISTS pedidos_empenho (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pregao_id      UUID NOT NULL REFERENCES pregoes(id),
  fornecedor_id  UUID NOT NULL REFERENCES fornecedores(id),
  status         TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO','CONFIRMADO','CANCELADO')),
  valor_total    NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes    TEXT,
  criado_em      TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pedido_empenho (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pedido_id       UUID NOT NULL REFERENCES pedidos_empenho(id) ON DELETE CASCADE,
  item_pregao_id  UUID NOT NULL REFERENCES itens_pregao(id),
  quantidade      NUMERIC(12,4) NOT NULL,
  valor_unitario  NUMERIC(15,4) NOT NULL,
  valor_total     NUMERIC(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS movimentacoes_saldo (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  item_pregao_id  UUID NOT NULL REFERENCES itens_pregao(id),
  pedido_id       UUID REFERENCES pedidos_empenho(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('EMPENHO','ESTORNO','AJUSTE')),
  quantidade      NUMERIC(12,4) NOT NULL,
  saldo_antes     NUMERIC(12,4) NOT NULL,
  saldo_depois    NUMERIC(12,4) NOT NULL,
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pregoes_updated_at') THEN
    CREATE TRIGGER trg_pregoes_updated_at BEFORE UPDATE ON pregoes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_itens_updated_at') THEN
    CREATE TRIGGER trg_itens_updated_at BEFORE UPDATE ON itens_pregao FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_produtos_updated_at') THEN
    CREATE TRIGGER trg_produtos_updated_at BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
`

async function run() {
  console.log('🔌 Conectando ao Supabase...')
  await client.connect()
  console.log('✅ Conectado! Criando tabelas...')
  
  try {
    await client.query(SQL)
    console.log('✅ Todas as tabelas criadas com sucesso!')

    // Verificar tabelas criadas
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `)
    console.log('\n📋 Tabelas no banco:')
    res.rows.forEach(r => console.log('  -', r.table_name))
  } catch (err) {
    console.error('❌ Erro:', err.message)
  } finally {
    await client.end()
    console.log('\n🔌 Conexão encerrada.')
  }
}

run()
