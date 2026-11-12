-- Ajustes autorizados em 12/11/2026; aplicado no banco e verificado.
BEGIN;
DO $$
DECLARE n integer;
BEGIN
PERFORM id FROM public.pedidos_compra WHERE id IN ('4003d08f-569b-4d19-bfa1-6f6b4deb435f','5f675972-bc6e-4074-9731-f755813a3b86') ORDER BY id FOR UPDATE;
UPDATE public.itens_pedido_compra i
SET valor_unitario=23.28, valor_total=round(quantidade*23.28,2),
empenhos_sped=(SELECT jsonb_agg(CASE WHEN e->>'numero'='2026NE001755' THEN e || jsonb_build_object('revisao_anterior',e,'status','ne_conferida_ressalva_tamanhos','ressalvas','NE 2026NE001755 / UG 160518 conferida no PDF recebido. Preço ajustado de R$ 19,40 para R$ 23,28 por autorização do usuário em 12/11/2026: 200 unidades, total R$ 4.656,00. Mantida a distribuição P=173, M=17 e XG=10. Ressalva: a descrição da NE cita tamanho médio, sem discriminar esse rateio; a distribuição por tamanho não foi confirmada pela NE. PDF recebido; anexação atual no SPED não verificada.','valor_cadastrado_item',round(i.quantidade*23.28,2),'ajustado_em','2026-11-12') ELSE e END ORDER BY ord) FROM jsonb_array_elements(i.empenhos_sped) WITH ORDINALITY t(e,ord))
WHERE pedido_id='4003d08f-569b-4d19-bfa1-6f6b4deb435f'
AND id IN ('85b43c04-a3cb-4e0d-814a-dde54dcc287a','6e306681-9828-4a7d-9a0c-875422393d08','b1c9b037-15cf-47b8-8991-eef2544e674b')
AND valor_unitario=19.40;
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>3 THEN RAISE EXCEPTION 'SKY: esperado alterar três itens'; END IF;
UPDATE public.itens_pedido_compra i SET quantidade=61,valor_total=round(61*valor_unitario,2),
empenhos_sped=(SELECT jsonb_agg(CASE WHEN e->>'numero'='2026NE001795' THEN e || jsonb_build_object('revisao_anterior',e,'status','ne_conferida','ressalvas','NE 2026NE001795 / UG 160518 conferida no PDF recebido. Quantidade ajustada de 55 para 61 unidades por autorização do usuário em 12/11/2026, a R$ 9,90, total R$ 603,90. CNPJ, pregão 90016/2026, item 18 e processo digital coincidem. Divergência de quantidade resolvida. PDF recebido; anexação atual no SPED não verificada.','ajustado_em','2026-11-12') ELSE e END ORDER BY ord) FROM jsonb_array_elements(i.empenhos_sped) WITH ORDINALITY t(e,ord))
WHERE id='a75a3870-e048-43c3-8c61-6a788f79ed60' AND pedido_id='5f675972-bc6e-4074-9731-f755813a3b86' AND quantidade=55 AND valor_unitario=9.90;
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>1 THEN RAISE EXCEPTION 'RICARDO: esperado alterar um item'; END IF;
UPDATE public.pedidos_compra p SET valor_total=(SELECT coalesce(sum(i.valor_total),0) FROM public.itens_pedido_compra i WHERE i.pedido_id=p.id), atualizado_em=now()
WHERE id IN ('4003d08f-569b-4d19-bfa1-6f6b4deb435f','5f675972-bc6e-4074-9731-f755813a3b86');
END $$;
COMMIT;
