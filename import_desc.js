import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Lê o .env.local manualmente para não depender do dotenv
const envContent = fs.readFileSync('.env.local', 'utf-8');
let serviceRoleKey = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    serviceRoleKey = line.split('=')[1].trim();
  }
});

if (!serviceRoleKey) {
  console.error('ERRO: Chave não encontrada no .env.local');
  process.exit(1);
}

const SUPABASE_URL = 'https://axuvwfkhauoizforekxi.supabase.co';
const supabase = createClient(SUPABASE_URL, serviceRoleKey);

async function importDescriptions() {
  console.log('Iniciando importação usando Service Role Key...');
  const fileContent = fs.readFileSync('Referencias/gemini-code-1782950401978.txt', 'utf-8');
  const lines = fileContent.split('\n');

  // Buscar todos os pregões para mapear numero_pregao -> pregao_id
  const { data: pregoes, error: pregoesError } = await supabase.from('pregoes').select('id, numero_pregao');
  if (pregoesError) {
    console.error('Erro ao buscar pregões:', pregoesError);
    return;
  }
  
  if (!pregoes || pregoes.length === 0) {
    console.log('Nenhum pregão encontrado no banco de dados!');
    return;
  }

  const pregaoMap = {};
  pregoes.forEach(p => {
    pregaoMap[p.numero_pregao] = p.id;
  });

  console.log(`Pregões mapeados: ${Object.keys(pregaoMap).join(', ')}`);

  let atualizados = 0;
  let erros = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(';');
    if (parts.length < 3) continue;

    const numero_pregao = parts[0].trim();
    const numero_item = parseInt(parts[1].trim(), 10);
    const descricao = parts.slice(2).join(';').trim();

    const pregao_id = pregaoMap[numero_pregao];
    if (!pregao_id) {
      console.warn(`[AVISO] Pregão não encontrado no banco: ${numero_pregao}`);
      continue;
    }

    // Atualizar item
    const { data, error } = await supabase
      .from('itens_pregao')
      .update({ descricao: descricao })
      .eq('pregao_id', pregao_id)
      .eq('numero_item', numero_item)
      .select();

    if (error) {
      console.error(`[ERRO] Item ${numero_item} do pregão ${numero_pregao}:`, error.message);
      erros++;
    } else {
      if (data && data.length > 0) {
        atualizados++;
        if (atualizados % 10 === 0) {
          console.log(`${atualizados} itens atualizados...`);
        }
      } else {
         console.warn(`[AVISO] Item ${numero_item} do pregão ${numero_pregao} não encontrado na tabela itens_pregao.`);
      }
    }
  }

  console.log(`\n============================`);
  console.log(`Importação concluída!`);
  console.log(`Itens atualizados: ${atualizados}`);
  console.log(`Erros: ${erros}`);
  console.log(`============================\n`);
}

importDescriptions();
