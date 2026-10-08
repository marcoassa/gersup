import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://axuvwfkhauoizforekxi.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4dXZ3ZmtoYXVvaXpmb3Jla3hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTQwMjUsImV4cCI6MjA5MzU3MDAyNX0.3cB69ECt2gCxuMdOpz8JArnAG_q6_qamEOIKwKBpXzg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: pedidos, error: errorPedido } = await supabase
    .from('pedidos_compra')
    .select('*')
    .eq('numero', 9);
    
  if (errorPedido || !pedidos || pedidos.length === 0) {
    console.log('Pedido nao encontrado');
    return;
  }
  
  const pedido = pedidos[0];
  console.log('Pedido:', pedido.numero, 'ID:', pedido.id);
  
  const { data: itens, error: errorItens } = await supabase
    .from('itens_pedido_compra')
    .select('*')
    .eq('pedido_id', pedido.id)
    .eq('numero_item', 24);
    
  if (errorItens || !itens || itens.length === 0) {
    console.log('Item nao encontrado');
    return;
  }
  
  const item = itens[0];
  console.log('Item antes:', { numero_item: item.numero_item, quantidade: item.quantidade, valor_unitario: item.valor_unitario, valor_total: item.valor_total });
  
  const newQuantidade = 11;
  const newTotalItem = newQuantidade * item.valor_unitario;
  
  const { error: errorUpdateItem } = await supabase
    .from('itens_pedido_compra')
    .update({ quantidade: newQuantidade, valor_total: newTotalItem })
    .eq('id', item.id);
    
  if (errorUpdateItem) {
      console.log('Erro ao atualizar item:', errorUpdateItem);
      return;
  }
  console.log('Item atualizado com sucesso. Quantidade =', newQuantidade, 'Total =', newTotalItem);
  
  // Update pedido total
  const { data: todosItens } = await supabase
    .from('itens_pedido_compra')
    .select('valor_total')
    .eq('pedido_id', pedido.id);
    
  let novoTotalPedido = 0;
  for (const i of todosItens) {
      novoTotalPedido += parseFloat(i.valor_total);
  }
  
  const { error: errorUpdatePedido } = await supabase
    .from('pedidos_compra')
    .update({ valor_total: novoTotalPedido })
    .eq('id', pedido.id);
    
  if (errorUpdatePedido) {
      console.log('Erro ao atualizar pedido:', errorUpdatePedido);
  } else {
      console.log('Pedido atualizado com sucesso. Novo Total =', novoTotalPedido);
  }
}

run();
