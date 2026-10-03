-- Plataforma: a equipe do BellarisOS que atende as redes (fase 1 do suporte,
-- 2026-10-03).
--
-- Quem é da plataforma NÃO é membro de rede: é um login do Auth com a marca
-- `app_metadata.plataforma` ('SUPORTE' | 'ADMIN') e uma linha aqui, que é a
-- fonte de verdade (a marca só serve para o app desviar a pessoa do portal
-- das redes). Sem `tenant_id`, nenhuma política de RLS de rede a alcança.
--
-- As duas tabelas são como credencial (CLAUDE.md §4): RLS ligada e ZERO
-- políticas — a sessão não lê nem escreve, só o servidor (service role).

create table if not exists public.platform_staff (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid not null unique,
  name        text not null,
  email       text not null,
  papel       text not null check (papel in ('SUPORTE', 'ADMIN')),
  is_active   boolean not null default true,
  created_by  uuid references public.platform_staff(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.platform_staff enable row level security;

-- O que a plataforma fez, e onde. Só acrescenta: é o registro que a clínica
-- vê ("o suporte abriu o painel da sua rede") e que responde "quem fez isto".
create table if not exists public.platform_audit_log (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid references public.platform_staff(id),
  tenant_id       uuid references public.tenants(id) on delete cascade,
  kind            text not null,
  target_user_id  uuid,
  dados           jsonb not null default '{}'::jsonb,
  at              timestamptz not null default now()
);
alter table public.platform_audit_log enable row level security;
create index if not exists platform_audit_log_tenant_at on public.platform_audit_log (tenant_id, at desc);
create index if not exists platform_audit_log_at on public.platform_audit_log (at desc);

-- Append-only: só a limpeza de teste apaga (pelo service role, que dispensa o
-- gatilho só quando a rede some em cascata).
create or replace function private.platform_audit_log_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'O registro de auditoria da plataforma não se altera.';
  end if;
  return old;
end $$;
drop trigger if exists trg_platform_audit_log_imutavel on public.platform_audit_log;
create trigger trg_platform_audit_log_imutavel
  before update on public.platform_audit_log
  for each row execute function private.platform_audit_log_imutavel();

-- As redes, agregadas no banco (sem o teto de 1000 linhas do PostgREST).
-- O último uso vem das SESSÕES do Auth, não de `last_sign_in_at`: a entrada do
-- suporte também atualiza aquele campo, e o painel mentiria.
create or replace function public.suporte_resumo_redes()
returns table (
  id uuid, name text, slug text, email text,
  plan_name text, plan_status text, trial_ends_at timestamptz, is_active boolean,
  created_at timestamptz, onboarding_completed_at timestamptz,
  unidades int, membros int, clientes int, ultimo_uso timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    t.id, t.name, t.slug, t.email,
    t.plan_name, t.plan_status, t.trial_ends_at, t.is_active,
    t.created_at, t.onboarding_completed_at,
    (select count(*) from public.branches b where b.tenant_id = t.id and b.is_active)::int,
    (select count(*) from public.users u where u.tenant_id = t.id and u.is_active)::int,
    (select count(*) from public.clients c where c.tenant_id = t.id and c.is_active)::int,
    (select max(coalesce(s.refreshed_at at time zone 'UTC', s.updated_at))
       from auth.sessions s
       join public.users u on u.auth_id = s.user_id::text
      where u.tenant_id = t.id)
  from public.tenants t
  order by t.created_at desc
$$;

-- O último uso de cada membro de uma rede (o detalhe da rede no painel).
create or replace function public.suporte_ultimo_uso(p_tenant uuid)
returns table (user_id uuid, ultimo_uso timestamptz)
language sql stable security definer set search_path = public
as $$
  select u.id, max(coalesce(s.refreshed_at at time zone 'UTC', s.updated_at))
  from public.users u
  left join auth.sessions s on s.user_id::text = u.auth_id
  where u.tenant_id = p_tenant
  group by u.id
$$;

revoke execute on function public.suporte_resumo_redes() from public, anon, authenticated;
revoke execute on function public.suporte_ultimo_uso(uuid) from public, anon, authenticated;
grant execute on function public.suporte_resumo_redes() to service_role;
grant execute on function public.suporte_ultimo_uso(uuid) to service_role;

-- Derruba todas as sessões de um login (redefinir a verificação em duas
-- etapas de alguém da plataforma: a sessão aal2 não sobrevive ao fator que a
-- provou). Só o servidor chama.
create or replace function public.plataforma_encerrar_sessoes(p_auth_id uuid)
returns void
language sql security definer set search_path = public
as $$ delete from auth.sessions where user_id = p_auth_id $$;
revoke execute on function public.plataforma_encerrar_sessoes(uuid) from public, anon, authenticated;
grant execute on function public.plataforma_encerrar_sessoes(uuid) to service_role;

notify pgrst, 'reload schema';
