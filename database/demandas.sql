-- Demandas por item/origem. O levantamento privado é importado separadamente.
create table public.demandas (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 codigo text not null,
 lote_importacao text,
 grupo text not null,
 descricao text not null check (length(trim(descricao)) > 0),
 requisitante text not null default '',
 quantidade_original text not null default '',
 cm text not null default '', pn text not null default '', mpn text not null default '',
 situacao_fonte text not null default 'Sem conclusão informada',
 estado_demanda text not null default 'A_VALIDAR' check (estado_demanda in ('A_VALIDAR','ABERTA','PARCIALMENTE_ATENDIDA','ATENDIDA','CANCELADA')),
 etapa_compra text not null default 'A_VERIFICAR' check (etapa_compra in ('A_VERIFICAR','SEM_VIA','ESPECIFICACAO','PREGAO','RECURSO','EM_ELABORACAO','PEDIDO_FINALIZADO','EMPENHADO')),
 entrega text not null default 'A_VERIFICAR' check (entrega in ('A_VERIFICAR','NAO_ENTREGUE','PARCIAL','ENTREGUE')),
 evidencia_entrega text not null default '',
 prioridade text not null default 'A_DEFINIR' check (prioridade in ('A_DEFINIR','NORMAL','ALTA','URGENTE')),
 data_necessidade date,
 responsavel text not null default '',
 proxima_acao text not null default '',
 observacoes text not null default '',
 pendencias text not null default '',
 revisao text not null default 'PENDENTE' check (revisao in ('PENDENTE','VALIDADA')),
 justificativa text not null default '',
 dados_origem jsonb not null default '{}' check (jsonb_typeof(dados_origem)='object'),
 versao integer not null default 1,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 unique(owner_id,codigo),
 check (entrega='A_VERIFICAR' or length(trim(evidencia_entrega))>0),
 check (estado_demanda not in ('ATENDIDA','CANCELADA') or length(trim(justificativa))>0),
 check (revisao='PENDENTE' or length(trim(pendencias))=0)
);
create index demandas_owner on public.demandas(owner_id, codigo);
create table public.demandas_atendimentos (
 id uuid primary key default gen_random_uuid(),
 demanda_id uuid not null references public.demandas(id),
 tipo text not null check (tipo in ('COMPRA','ESTOQUE')),
 item_pedido_id uuid references public.itens_pedido_compra(id),
 estoque_id uuid references public.estoque(id),
 quantidade_prevista numeric not null check (quantidade_prevista > 0),
 quantidade_recebida numeric not null default 0 check (quantidade_recebida >= 0 and quantidade_recebida <= quantidade_prevista),
 quantidade_destinada numeric not null default 0 check (quantidade_destinada >= 0 and quantidade_destinada <= quantidade_recebida),
 unidade text not null check (length(trim(unidade))>0),
 data_recebimento date,
 evidencia text not null default '',
 observacoes text not null default '',
 ativo boolean not null default true,
 versao integer not null default 1,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 check ((tipo='COMPRA' and item_pedido_id is not null and estoque_id is null) or (tipo='ESTOQUE' and estoque_id is not null and item_pedido_id is null)),
 check (quantidade_recebida=0 or (data_recebimento is not null and length(trim(evidencia))>0)),
 check (ativo or length(trim(observacoes))>0)
);
create index demandas_atendimentos_demanda on public.demandas_atendimentos(demanda_id);
create index demandas_atendimentos_pedido on public.demandas_atendimentos(item_pedido_id);
create index demandas_atendimentos_estoque on public.demandas_atendimentos(estoque_id);
create unique index demandas_compra_ativa on public.demandas_atendimentos(demanda_id,item_pedido_id) where ativo and item_pedido_id is not null;
create unique index demandas_estoque_ativo on public.demandas_atendimentos(demanda_id,estoque_id) where ativo and estoque_id is not null;
create table public.demandas_historico (
 id bigint generated always as identity primary key,
 demanda_id uuid not null references public.demandas(id),
 atendimento_id uuid references public.demandas_atendimentos(id),
 autor uuid default auth.uid(),
 ocorrido_em timestamptz not null default now(),
 operacao text not null,
 antes jsonb, depois jsonb
);
create index demandas_historico_demanda on public.demandas_historico(demanda_id, ocorrido_em desc);
alter table public.demandas enable row level security;
alter table public.demandas_atendimentos enable row level security;
alter table public.demandas_historico enable row level security;
create policy demandas_select on public.demandas for select to authenticated using (owner_id=(select auth.uid()));
create policy demandas_insert on public.demandas for insert to authenticated with check (owner_id=(select auth.uid()));
create policy demandas_update on public.demandas for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy atendimentos_select on public.demandas_atendimentos for select to authenticated using (exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid())));
create policy atendimentos_insert on public.demandas_atendimentos for insert to authenticated with check (exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid())) and (item_pedido_id is null or exists(select 1 from public.itens_pedido_compra i where i.id=item_pedido_id)) and (estoque_id is null or exists(select 1 from public.estoque e where e.id=estoque_id)));
create policy atendimentos_update on public.demandas_atendimentos for update to authenticated using (exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid()))) with check (exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid())));
create policy historico_select on public.demandas_historico for select to authenticated using (exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid())));
create policy historico_trigger on public.demandas_historico for insert to authenticated with check (pg_trigger_depth()>0 and autor=(select auth.uid()) and exists(select 1 from public.demandas d where d.id=demanda_id and d.owner_id=(select auth.uid())));
revoke all on public.demandas,public.demandas_atendimentos,public.demandas_historico from anon,authenticated;
grant select,insert on public.demandas to authenticated;
grant update(descricao,requisitante,cm,pn,mpn,estado_demanda,etapa_compra,entrega,evidencia_entrega,prioridade,data_necessidade,responsavel,proxima_acao,observacoes,pendencias,revisao,justificativa) on public.demandas to authenticated;
grant select,insert on public.demandas_atendimentos to authenticated;
grant update(quantidade_prevista,quantidade_recebida,quantidade_destinada,unidade,data_recebimento,evidencia,observacoes,ativo) on public.demandas_atendimentos to authenticated;
grant select,insert on public.demandas_historico to authenticated;
grant usage on sequence public.demandas_historico_id_seq to authenticated;

create function public.demandas_versao() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.versao=old.versao+1; new.atualizado_em=now(); return new;
end $$;
create trigger demandas_versao before update on public.demandas for each row execute function public.demandas_versao();
create trigger atendimentos_versao before update on public.demandas_atendimentos for each row execute function public.demandas_versao();
create function public.demandas_auditar() returns trigger language plpgsql security invoker set search_path='' as $$
declare demanda uuid; atendimento uuid; old_data jsonb;
begin
 if tg_table_name='demandas' then demanda=new.id; else demanda=new.demanda_id; atendimento=new.id; end if;
 if tg_op='UPDATE' then old_data=to_jsonb(old)-'dados_origem'; end if;
 insert into public.demandas_historico(demanda_id,atendimento_id,autor,operacao,antes,depois)
 values(demanda,atendimento,auth.uid(),tg_table_name||':'||tg_op,old_data,to_jsonb(new)-'dados_origem');
 return new;
end $$;
create trigger demandas_auditar after insert or update on public.demandas for each row execute function public.demandas_auditar();
create trigger atendimentos_auditar after insert or update on public.demandas_atendimentos for each row execute function public.demandas_auditar();
revoke all on function public.demandas_versao(),public.demandas_auditar() from public,anon,authenticated;
