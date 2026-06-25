-- ================================================================
-- GERSUP — Notas de Crédito (NC)
-- Execute no SQL Editor do painel Supabase
-- ================================================================

CREATE TABLE IF NOT EXISTS notas_credito (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ptres             TEXT NOT NULL,
  fonte_recursos    TEXT NOT NULL DEFAULT '1000000000',
  natureza_despesa  TEXT NOT NULL DEFAULT '339000',
  ugr               TEXT NOT NULL,
  plano_interno     TEXT NOT NULL,
  si                TEXT NOT NULL,  -- derivado automaticamente do Ementário NICAvEx
  valor             NUMERIC(15,2) NOT NULL DEFAULT 0,
  descricao         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_credito_si ON notas_credito(si);
CREATE INDEX IF NOT EXISTS idx_notas_credito_plano_interno ON notas_credito(plano_interno);

-- Trigger para updated_at automático
CREATE TRIGGER trg_notas_credito_updated_at
  BEFORE UPDATE ON notas_credito
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
