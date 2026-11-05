-- As origens do lead são da CLÍNICA (A14 da 7ª simulação, 2026-11-05;
-- princípio 1: "a clínica decide"). Eram uma lista fixa de dez no código
-- (LEAD_SOURCES), e a Gardênia não tinha onde pôr "Feira de noivas". A rede
-- ganha o vocabulário dela, editado em "Configurar funis" como os motivos de
-- perda, e nasce com as de sempre. `leads.source` continua o TEXTO (o nome da
-- origem): nada se reescreve, e a origem derivada do anúncio (Meta Ads, Google
-- Ads) continua vindo da atribuição.

create table if not exists public.crm_origens (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  nome       text not null check (length(trim(nome)) between 1 and 40),
  ativo      boolean not null default true,
  posicao    smallint not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_origens_nome on public.crm_origens (tenant_id, lower(nome));

-- Só o servidor lê e grava (nenhuma política permissiva); as restritivas do
-- suporte por regra (CLAUDE.md §14).
alter table public.crm_origens enable row level security;
create policy suporte_sem_escrita_ins on public.crm_origens as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.crm_origens as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.crm_origens as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- As origens com que a rede nasce (e que as redes de hoje ganham agora) — as
-- de LEAD_SOURCES (`packages/utils/src/lead-source.ts`), na mesma ordem.
create or replace function private.origens_semear(p_tenant uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  insert into public.crm_origens (tenant_id, nome, posicao)
  select p_tenant, o.nome, o.posicao
    from (values ('Meta Ads', 1), ('Google Ads', 2), ('Orgânico', 3), ('Instagram', 4), ('Indicação', 5),
                 ('WhatsApp', 6), ('Telefone', 7), ('Site', 8), ('Evento', 9), ('Outro', 10)) as o(nome, posicao)
   where not exists (select 1 from public.crm_origens x where x.tenant_id = p_tenant)
  on conflict do nothing;
$function$;

create or replace function private.trg_origens_na_rede_nova()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.origens_semear(new.id);
  return new;
end $function$;

create or replace trigger trg_origens_na_rede_nova
  after insert on public.tenants
  for each row execute function private.trg_origens_na_rede_nova();

select private.origens_semear(t.id) from public.tenants t;

notify pgrst, 'reload schema';
