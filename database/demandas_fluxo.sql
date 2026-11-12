-- Aplicar após demandas.sql. Fontes originais e histórico permanecem preservados.
begin;
alter table public.demandas drop constraint demandas_estado_demanda_check;
alter table public.demandas drop constraint demandas_check1;
update public.demandas set estado_demanda='ABERTA' where estado_demanda in ('A_VALIDAR','CANCELADA');
alter table public.demandas alter column estado_demanda set default 'ABERTA';
alter table public.demandas add constraint demandas_estado_demanda_check check (estado_demanda in ('ABERTA','AGUARDANDO_PREGAO','AGUARDANDO_RECURSO','EMPENHADO_AGUARDANDO_ENTREGA','PARCIALMENTE_ATENDIDA','ATENDIDA'));
alter table public.demandas add constraint demandas_encerramento_justificado check (estado_demanda not in ('ATENDIDA','PARCIALMENTE_ATENDIDA') or length(trim(justificativa))>0);
alter table public.demandas add column quantidade_atual text not null default '';
alter table public.demandas add column pregao_vigencia text not null default 'A_VERIFICAR' check (pregao_vigencia in ('SIM','NAO','A_VERIFICAR'));
alter table public.demandas add column pregoes_vigentes jsonb not null default '[]' check (jsonb_typeof(pregoes_vigentes)='array');
update public.demandas set quantidade_atual=quantidade_original;
create function public.demandas_referencias_validas(refs jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
 select not exists (select 1 from jsonb_array_elements(refs) r where coalesce(trim(r->>'pregao'),'')='' or coalesce(trim(r->>'item'),'')='' or coalesce(r->>'vigencia_final','') !~ '^\d{4}-\d{2}-\d{2}$');
$$;
alter table public.demandas add constraint demandas_pregao_identificado check (pregao_vigencia<>'SIM' or (jsonb_array_length(pregoes_vigentes)>0 and public.demandas_referencias_validas(pregoes_vigentes)));
revoke all on function public.demandas_referencias_validas(jsonb) from public,anon;
grant execute on function public.demandas_referencias_validas(jsonb) to authenticated;
grant update(grupo,quantidade_atual,pregao_vigencia,pregoes_vigentes) on public.demandas to authenticated;
commit;

