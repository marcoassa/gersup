import pkg from 'pg'
const { Client } = pkg

const client = new Client({
  connectionString: 'postgresql://postgres:56BvwCaTqkfwUBA2@db.axuvwfkhauoizforekxi.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function run() {
  console.log('🔌 Conectando...')
  await client.connect()
  console.log('✅ Conectado! Inserindo dados...\n')

  try {
    // ── Fornecedores ──────────────────────────────────────────────
    console.log('📦 Inserindo fornecedores...')
    await client.query(`
      INSERT INTO fornecedores (id, cnpj, razao_social, nome_fantasia, contato, email) VALUES
        ('00000000-0000-0000-0000-000000000001', '12.345.678/0001-90', 'TECNOSUPR LTDA', 'TecnoSupr', 'João Silva', 'comercial@tecnosupr.com.br'),
        ('00000000-0000-0000-0000-000000000002', '98.765.432/0001-10', 'AEROMIX COMERCIO E INDUSTRIA SA', 'AeroMix', 'Maria Santos', 'vendas@aeromix.com.br'),
        ('00000000-0000-0000-0000-000000000003', '11.222.333/0001-44', 'GLOBAL PARTS DISTRIBUIDORA LTDA', 'Global Parts', 'Carlos Oliveira', 'supply@globalparts.com.br')
      ON CONFLICT (cnpj) DO NOTHING;
    `)
    console.log('  ✅ 3 fornecedores')

    // ── Pregões ───────────────────────────────────────────────────
    console.log('📋 Inserindo pregões...')
    await client.query(`
      INSERT INTO pregoes (id, numero_pregao, objeto, data_abertura, data_vencimento, valor_total, valor_empenhado, fornecedor_id) VALUES
        ('10000000-0000-0000-0000-000000000001', 'PE-001/2025', 'Aquisição de materiais elétricos e componentes eletrônicos para manutenção aeronáutica', '2025-02-15', '2026-08-15', 850000, 620000, '00000000-0000-0000-0000-000000000001'),
        ('10000000-0000-0000-0000-000000000002', 'PE-002/2025', 'Fornecimento de materiais hidráulicos e pneumáticos', '2025-03-10', '2026-06-15', 1200000, 980000, '00000000-0000-0000-0000-000000000002'),
        ('10000000-0000-0000-0000-000000000003', 'PE-003/2025', 'Aquisição de ferramentas e equipamentos de apoio à manutenção', '2025-04-01', '2026-09-30', 450000, 120000, '00000000-0000-0000-0000-000000000003'),
        ('10000000-0000-0000-0000-000000000004', 'PE-004/2024', 'Fornecimento de lubrificantes e fluidos especiais', '2024-06-01', '2025-06-01', 320000, 318500, '00000000-0000-0000-0000-000000000001'),
        ('10000000-0000-0000-0000-000000000005', 'PE-005/2025', 'Materiais de limpeza e produtos de higienização para hangares', '2025-01-10', '2025-06-30', 95000, 42000, '00000000-0000-0000-0000-000000000002')
      ON CONFLICT (numero_pregao) DO NOTHING;
    `)
    console.log('  ✅ 5 pregões')

    // ── Itens do Pregão ───────────────────────────────────────────
    console.log('📝 Inserindo itens do pregão...')
    await client.query(`
      INSERT INTO itens_pregao (id, pregao_id, numero_item, descricao, unidade, quantidade_licitada, quantidade_empenhada, saldo_empenho, valor_unitario, fornecedor_id, cd_comp_master) VALUES
        ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Capacitor eletrolítico 470uF 25V', 'UN', 500, 380, 120, 4.50, '00000000-0000-0000-0000-000000000001', 'CAP-001'),
        ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Resistor 10kΩ 1/4W 1% SMD 0805', 'CX', 200, 198, 2, 12.00, '00000000-0000-0000-0000-000000000001', 'RES-010'),
        ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3, 'Conector circular MIL-DTL-26482 Série I', 'UN', 150, 90, 60, 85.00, '00000000-0000-0000-0000-000000000001', 'CON-026'),
        ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 4, 'Fusível cerâmico 5A 250V 5x20mm', 'CX', 300, 300, 0, 8.50, '00000000-0000-0000-0000-000000000001', 'FUS-005'),
        ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 1, 'O-ring NBR 70 Shore A diâm. 25mm', 'CX', 1000, 950, 50, 2.80, '00000000-0000-0000-0000-000000000002', 'ORG-025'),
        ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 2, 'Mangueira hidráulica SAE 100R2 DN10', 'MT', 500, 480, 20, 45.00, '00000000-0000-0000-0000-000000000002', 'MAN-R2D'),
        ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 3, 'Válvula de retenção 1/4" NPT aço inox', 'UN', 80, 65, 15, 320.00, '00000000-0000-0000-0000-000000000002', 'VAL-RET'),
        ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003', 1, 'Torquímetro estalo 10-60 Nm encaixe 3/8"', 'UN', 10, 3, 7, 890.00, '00000000-0000-0000-0000-000000000003', NULL),
        ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 2, 'Jogo de brocas HSS 1-13mm 25 peças', 'JG', 20, 8, 12, 145.00, '00000000-0000-0000-0000-000000000003', NULL),
        ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000005', 1, 'Detergente neutro concentrado 5L', 'UN', 200, 90, 110, 32.00, '00000000-0000-0000-0000-000000000002', NULL)
      ON CONFLICT (pregao_id, numero_item) DO NOTHING;
    `)
    console.log('  ✅ 10 itens')

    // ── Produtos ──────────────────────────────────────────────────
    console.log('🔩 Inserindo produtos...')
    await client.query(`
      INSERT INTO produtos (cd_comp, cd_comp_master, pn, mpn, nomenclatura, fabricante, nd, si, pos_familia, mercado) VALUES
        ('CAP-001', 'CAP-001', 'CAP-470-25-EL', 'UVZ1E471MED', 'Capacitor eletrolítico 470uF 25V', 'Nichicon', '30', '01', 'MASTER', 'INTERNO'),
        ('CAP-001-EQ1', 'CAP-001', 'CAP-470-25-ELB', 'ECA1EHG471', 'Capacitor eletrolítico 470uF 25V (equiv)', 'Panasonic', '30', '01', 'EQUIVALENTE', 'INTERNO'),
        ('RES-010', 'RES-010', 'RES-10K-SMD', 'RC0805FR-0710KL', 'Resistor 10kΩ 1/4W 1% SMD 0805', 'Yageo', '30', '01', 'MASTER', 'INTERNO'),
        ('CON-026', 'CON-026', 'CON-MIL-26482', 'MS3106A18-1S', 'Conector circular MIL-DTL-26482 Série I', 'Amphenol', '30', '02', 'MASTER', 'INTERNO'),
        ('FUS-005', 'FUS-005', 'FUS-5A-250V', 'F5AL250V', 'Fusível cerâmico 5A 250V 5x20mm', 'Littelfuse', '30', '01', 'MASTER', 'INTERNO'),
        ('ORG-025', 'ORG-025', 'ORG-NBR-25', '2-025-N70', 'O-ring NBR 70 Shore A diâm. 25mm', 'Parker', '30', '03', 'MASTER', 'INTERNO'),
        ('MAN-R2D', 'MAN-R2D', 'MAN-SAE-R2-10', 'SAE100R2-10', 'Mangueira hidráulica SAE 100R2 DN10', 'Gates', '30', '03', 'MASTER', 'INTERNO'),
        ('VAL-RET', 'VAL-RET', 'VAL-CK-14NPT', 'CK-400-14', 'Válvula de retenção 1/4" NPT aço inox', 'Swagelok', '30', '03', 'MASTER', 'INTERNO')
      ON CONFLICT (cd_comp) DO NOTHING;
    `)
    console.log('  ✅ 8 produtos (7 MASTER + 1 EQUIVALENTE)')

    // ── Estoque ───────────────────────────────────────────────────
    console.log('📦 Inserindo estoque CAVEX...')
    await client.query(`
      INSERT INTO estoque (cd_comp, ambiente, estoque_lib, estoque_res, estoque_total, data_referencia) VALUES
        ('CAP-001',     'CAVEX', 180, 20,  200, '2025-05-01'),
        ('CAP-001-EQ1', 'CAVEX', 50,  0,   50,  '2025-05-01'),
        ('RES-010',     'CAVEX', 15,  5,   20,  '2025-05-01'),
        ('CON-026',     'CAVEX', 8,   2,   10,  '2025-05-01'),
        ('FUS-005',     'CAVEX', 0,   0,   0,   '2025-05-01'),
        ('ORG-025',     'CAVEX', 320, 80,  400, '2025-05-01'),
        ('MAN-R2D',     'CAVEX', 12,  3,   15,  '2025-05-01'),
        ('VAL-RET',     'CAVEX', 3,   1,   4,   '2025-05-01')
      ON CONFLICT (cd_comp, ambiente) DO NOTHING;
    `)
    console.log('  ✅ 8 registros de estoque')

    // ── Fornecimentos ─────────────────────────────────────────────
    console.log('📊 Inserindo histórico de fornecimentos...')
    await client.query(`
      INSERT INTO fornecimentos (cd_comp, cd_comp_master, ano, data, quantidade, solicitante, ambiente) VALUES
        ('CAP-001',     'CAP-001', 2021, '2021-03-10', 120, 'CAVEX-1', 'CAVEX'),
        ('CAP-001',     'CAP-001', 2022, '2022-04-15', 145, 'CAVEX-1', 'CAVEX'),
        ('CAP-001',     'CAP-001', 2023, '2023-05-20', 160, 'CAVEX-2', 'CAVEX'),
        ('CAP-001',     'CAP-001', 2024, '2024-02-28', 180, 'CAVEX-1', 'CAVEX'),
        ('CAP-001-EQ1', 'CAP-001', 2023, '2023-08-10', 60,  'CAVEX-2', 'CAVEX'),
        ('RES-010',     'RES-010', 2021, '2021-07-01', 8,   'CAVEX-1', 'CAVEX'),
        ('RES-010',     'RES-010', 2022, '2022-06-10', 10,  'CAVEX-1', 'CAVEX'),
        ('RES-010',     'RES-010', 2023, '2023-09-15', 12,  'CAVEX-2', 'CAVEX'),
        ('RES-010',     'RES-010', 2024, '2024-04-20', 14,  'CAVEX-1', 'CAVEX'),
        ('CON-026',     'CON-026', 2022, '2022-02-20', 15,  'CAVEX-1', 'CAVEX'),
        ('CON-026',     'CON-026', 2023, '2023-03-10', 18,  'CAVEX-2', 'CAVEX'),
        ('CON-026',     'CON-026', 2024, '2024-01-15', 20,  'CAVEX-1', 'CAVEX'),
        ('FUS-005',     'FUS-005', 2021, '2021-05-15', 80,  'CAVEX-1', 'CAVEX'),
        ('FUS-005',     'FUS-005', 2022, '2022-08-20', 90,  'CAVEX-2', 'CAVEX'),
        ('FUS-005',     'FUS-005', 2023, '2023-07-05', 100, 'CAVEX-1', 'CAVEX'),
        ('FUS-005',     'FUS-005', 2024, '2024-03-12', 110, 'CAVEX-1', 'CAVEX'),
        ('ORG-025',     'ORG-025', 2021, '2021-01-20', 500, 'CAVEX-2', 'CAVEX'),
        ('ORG-025',     'ORG-025', 2022, '2022-03-10', 550, 'CAVEX-1', 'CAVEX'),
        ('ORG-025',     'ORG-025', 2023, '2023-02-15', 600, 'CAVEX-2', 'CAVEX'),
        ('ORG-025',     'ORG-025', 2024, '2024-01-30', 620, 'CAVEX-1', 'CAVEX'),
        ('VAL-RET',     'VAL-RET', 2022, '2022-11-10', 5,   'CAVEX-1', 'CAVEX'),
        ('VAL-RET',     'VAL-RET', 2023, '2023-10-20', 6,   'CAVEX-2', 'CAVEX'),
        ('VAL-RET',     'VAL-RET', 2024, '2024-09-05', 7,   'CAVEX-1', 'CAVEX');
    `)
    console.log('  ✅ 23 registros de fornecimento')

    // Verificação final
    const counts = await client.query(`
      SELECT 'fornecedores' AS t, COUNT(*) FROM fornecedores
      UNION ALL SELECT 'pregoes', COUNT(*) FROM pregoes
      UNION ALL SELECT 'itens_pregao', COUNT(*) FROM itens_pregao
      UNION ALL SELECT 'produtos', COUNT(*) FROM produtos
      UNION ALL SELECT 'estoque', COUNT(*) FROM estoque
      UNION ALL SELECT 'fornecimentos', COUNT(*) FROM fornecimentos;
    `)
    console.log('\n📊 Resumo final do banco:')
    counts.rows.forEach(r => console.log(`  ${r.t}: ${r.count} registro(s)`))

  } catch (err) {
    console.error('\n❌ Erro:', err.message)
  } finally {
    await client.end()
    console.log('\n🔌 Conexão encerrada.')
  }
}

run()
