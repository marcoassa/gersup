BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"c368ba26-79f0-48fe-a57a-29edbe43ad99","role":"authenticated"}',true);
DO $$
DECLARE p uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); t timestamptz;
BEGIN
INSERT INTO public.pedidos_compra(id,numero,status) VALUES(p,-999999,'FINALIZADO');
INSERT INTO public.itens_pedido_compra(id,pedido_id,cd_comp_master,quantidade,valor_total) VALUES(a,p,'TEST',2,20),(b,p,'TEST',3,30);
PERFORM public.marcar_entrega_item(p,a,true);
IF (SELECT status FROM public.pedidos_compra WHERE id=p)<>'FINALIZADO' OR (SELECT count(*) FROM public.itens_pedido_compra WHERE pedido_id=p AND entregue_em IS NULL)<>1 THEN RAISE EXCEPTION 'Partial failed'; END IF;
SELECT entregue_em INTO t FROM public.itens_pedido_compra WHERE id=a;
PERFORM public.marcar_entrega_item(p,a,true);
IF (SELECT entregue_em FROM public.itens_pedido_compra WHERE id=a) IS DISTINCT FROM t THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
PERFORM public.marcar_entrega_item(p,b,true);
IF (SELECT status FROM public.pedidos_compra WHERE id=p)<>'ENTREGUE' THEN RAISE EXCEPTION 'Completion failed'; END IF;
PERFORM public.marcar_entrega_item(p,a,false);
IF (SELECT status FROM public.pedidos_compra WHERE id=p)<>'FINALIZADO' OR (SELECT entregue_em FROM public.itens_pedido_compra WHERE id=b) IS NULL THEN RAISE EXCEPTION 'Undo failed'; END IF;
UPDATE public.pedidos_compra SET status='ENTREGUE' WHERE id=p;
IF EXISTS(SELECT 1 FROM public.itens_pedido_compra WHERE pedido_id=p AND entregue_em IS NULL) THEN RAISE EXCEPTION 'Bulk failed'; END IF;
BEGIN
PERFORM public.marcar_entrega_item(p,gen_random_uuid(),true);
RAISE EXCEPTION 'Unexpected success';
EXCEPTION WHEN raise_exception THEN
IF SQLERRM='Unexpected success' THEN RAISE; END IF;
END;
UPDATE public.pedidos_compra SET status='RASCUNHO' WHERE id=p;
BEGIN
PERFORM public.marcar_entrega_item(p,a,true);
RAISE EXCEPTION 'Unexpected success';
EXCEPTION WHEN raise_exception THEN
IF SQLERRM='Unexpected success' THEN RAISE; END IF;
END;
IF (SELECT sum(quantidade) FROM public.itens_pedido_compra WHERE pedido_id=p)<>5 THEN RAISE EXCEPTION 'Quantity changed'; END IF;
END $$;
ROLLBACK;
