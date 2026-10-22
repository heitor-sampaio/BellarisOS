-- O motivo da perda do lead (2026-10-21, decisão do Heitor: uma LISTA de
-- motivos da rede, editável, mais observação). Levar o card à etapa de
-- desfecho LOST pela tela pede o motivo; ele fica no lead (motivo, observação
-- e quando perdeu), na linha do tempo e no relatório de motivos.

create table if not exists public.crm_motivos_perda (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nome       text not null check (length(trim(nome)) between 1 and 60),
  ativo      boolean not null default true,
  posicao    smallint not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_motivos_perda_nome on public.crm_motivos_perda (tenant_id, lower(nome));

-- Só o servidor lê e grava (nenhuma política permissiva); as restritivas do
-- suporte por regra (CLAUDE.md §14).
alter table public.crm_motivos_perda enable row level security;
create policy suporte_sem_escrita_ins on public.crm_motivos_perda as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.crm_motivos_perda as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.crm_motivos_perda as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

alter table public.leads
  add column if not exists motivo_perda_id  uuid references public.crm_motivos_perda(id) on delete set null,
  add column if not exists motivo_perda_obs text,
  add column if not exists perdido_em       timestamptz;

-- Os motivos com que a rede nasce (e que as redes de hoje ganham agora).
create or replace function private.motivos_perda_semear(p_tenant uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  insert into public.crm_motivos_perda (tenant_id, nome, posicao)
  select p_tenant, m.nome, m.posicao
    from (values ('Preço', 1), ('Sem retorno', 2), ('Fechou com outra clínica', 3),
                 ('Sem horário que sirva', 4), ('Desistiu', 5), ('Outro', 6)) as m(nome, posicao)
   where not exists (select 1 from public.crm_motivos_perda x where x.tenant_id = p_tenant)
  on conflict do nothing;
$function$;

create or replace function private.trg_motivos_perda_na_rede_nova()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.motivos_perda_semear(new.id);
  return new;
end $function$;

drop trigger if exists trg_motivos_perda_na_rede_nova on public.tenants;
create trigger trg_motivos_perda_na_rede_nova
  after insert on public.tenants
  for each row execute function private.trg_motivos_perda_na_rede_nova();

select private.motivos_perda_semear(t.id) from public.tenants t;

-- O relatório: as perdas do período (perdido_em) por motivo.
create or replace function public.metrics_motivos_de_perda(p_tenant uuid, p_from timestamptz, p_to timestamptz)
 returns table(motivo text, total integer)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(m.nome, 'Sem motivo') as motivo, count(*)::integer as total
    from public.leads l
    left join public.crm_motivos_perda m on m.id = l.motivo_perda_id
   where l.tenant_id = p_tenant
     and l.perdido_em between p_from and p_to
   group by coalesce(m.nome, 'Sem motivo')
   order by count(*) desc, 1;
$function$;

revoke execute on function public.metrics_motivos_de_perda(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_motivos_de_perda(uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
