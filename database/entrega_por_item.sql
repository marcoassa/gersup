-- Entrega por linha do pedido; uma marcação representa toda a quantidade da linha.
ALTER TABLE public.itens_pedido_compra ADD COLUMN entregue_em timestamptz;
COMMENT ON COLUMN public.itens_pedido_compra.entregue_em IS 'Data da marcação de entrega integral deste item; null significa pendente.';

-- Compatibilidade com pedidos já entregues e com o botão de entrega do pedido inteiro.
UPDATE public.itens_pedido_compra i SET entregue_em=p.atualizado_em
FROM public.pedidos_compra p WHERE p.id=i.pedido_id AND p.status='ENTREGUE';

CREATE FUNCTION public.sincronizar_entrega_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'ENTREGUE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT EXISTS (SELECT 1 FROM public.itens_pedido_compra WHERE pedido_id=NEW.id) THEN
      RAISE EXCEPTION 'Pedido sem itens não pode ser entregue';
    END IF;
    UPDATE public.itens_pedido_compra SET entregue_em=coalesce(entregue_em,now())
    WHERE pedido_id=NEW.id;
  ELSIF NEW.status IN ('RASCUNHO','CANCELADO') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.itens_pedido_compra SET entregue_em=null WHERE pedido_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sincronizar_entrega_pedido AFTER UPDATE OF status ON public.pedidos_compra
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_entrega_pedido();

CREATE FUNCTION public.marcar_entrega_item(p_pedido_id uuid,p_item_id uuid,p_entregue boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE estado text; mudou integer;
BEGIN
  IF p_entregue IS NULL THEN RAISE EXCEPTION 'Informe a situação da entrega'; END IF;
  SELECT status INTO estado FROM public.pedidos_compra WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou sem permissão'; END IF;
  IF estado NOT IN ('FINALIZADO','ENTREGUE') THEN
    RAISE EXCEPTION 'Finalize o pedido antes de registrar uma entrega';
  END IF;
  UPDATE public.itens_pedido_compra
  SET entregue_em=CASE WHEN p_entregue THEN coalesce(entregue_em,now()) ELSE null END
  WHERE id=p_item_id AND pedido_id=p_pedido_id;
  GET DIAGNOSTICS mudou=ROW_COUNT;
  IF mudou<>1 THEN RAISE EXCEPTION 'Item não encontrado neste pedido ou sem permissão'; END IF;
  UPDATE public.pedidos_compra
  SET status=CASE WHEN EXISTS (
    SELECT 1 FROM public.itens_pedido_compra WHERE pedido_id=p_pedido_id AND entregue_em IS NULL
  ) THEN 'FINALIZADO' ELSE 'ENTREGUE' END, atualizado_em=now()
  WHERE id=p_pedido_id;
  GET DIAGNOSTICS mudou=ROW_COUNT;
  IF mudou<>1 THEN RAISE EXCEPTION 'Sem permissão para atualizar o pedido'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.marcar_entrega_item(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marcar_entrega_item(uuid,uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.sincronizar_entrega_pedido() FROM PUBLIC,anon;
