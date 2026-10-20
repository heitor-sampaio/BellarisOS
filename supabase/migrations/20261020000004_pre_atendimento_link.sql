-- O link do pré-atendimento (2026-10-20, etapa 4): para a cliente que não usa
-- o app, a equipe manda a ficha por um link (WhatsApp). O molde é o link de
-- assinatura (20260930000005):
--   - só o SHA-256 do token no banco — perdeu o link, gera outro (que revoga
--     o anterior);
--   - a pessoa confirma o CPF (ou o nascimento) ANTES de ver qualquer
--     pergunta, e é o banco que confere e conta: 5 erradas derrubam o link,
--     20 erradas na hora param o IP;
--   - RLS ligada e nenhuma política: só o servidor lê (é credencial).
-- O link morre com o pendente: respondida a ficha (pelo app, pela equipe ou
-- pelo próprio link), ele não abre mais.

create table if not exists public.pre_atendimento_links (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  pre_atendimento_id uuid not null references public.pre_atendimentos(id) on delete cascade,
  token_hash         text not null unique,
  expires_at         timestamptz not null,
  used_at            timestamptz,
  revoked_at         timestamptz,
  failed_attempts    int not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now()
);
-- Um link valendo por pré-atendimento.
create unique index if not exists pre_atendimento_links_um_ativo
  on public.pre_atendimento_links (pre_atendimento_id) where used_at is null and revoked_at is null;

create table if not exists public.pre_atendimento_link_attempts (
  id         bigint generated always as identity primary key,
  link_id    uuid not null references public.pre_atendimento_links(id) on delete cascade,
  ip         inet,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists pre_atendimento_link_attempts_ip on public.pre_atendimento_link_attempts (ip, created_at);

alter table public.pre_atendimento_links enable row level security;
alter table public.pre_atendimento_link_attempts enable row level security;

-- As restritivas do suporte, à mão (o laço de 20261008000010 rodou uma vez).
do $$
declare t text;
begin
  foreach t in array array['pre_atendimento_links', 'pre_atendimento_link_attempts'] loop
    execute format($f$create policy suporte_sem_escrita_ins on public.%I as restrictive for insert
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)$f$, t);
    execute format($f$create policy suporte_sem_escrita_upd on public.%I as restrictive for update
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)$f$, t);
    execute format($f$create policy suporte_sem_escrita_del on public.%I as restrictive for delete
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)$f$, t);
  end loop;
end $$;

-- ─── Criar (e revogar) ───────────────────────────────────────────────────────
-- Revoga o que estiver valendo; com p_token_hash nulo, só revoga.
create or replace function public.pre_atendimento_link_criar(
  p_pre uuid, p_tenant uuid, p_token_hash text, p_expira timestamptz, p_ator uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_id     uuid;
begin
  select p.status into v_status from public.pre_atendimentos p
   where p.id = p_pre and p.tenant_id = p_tenant
   for update;
  if not found then raise exception 'Pré-atendimento não encontrado.' using errcode = 'no_data_found'; end if;

  update public.pre_atendimento_links l set revoked_at = now()
   where l.pre_atendimento_id = p_pre and l.used_at is null and l.revoked_at is null;
  if p_token_hash is null then return null; end if;

  if v_status <> 'PENDENTE' then
    raise exception 'Esta ficha já foi respondida.' using errcode = 'P0001';
  end if;
  insert into public.pre_atendimento_links (tenant_id, pre_atendimento_id, token_hash, expires_at, created_by)
  values (p_tenant, p_pre, p_token_hash, p_expira, p_ator)
  returning id into v_id;
  return v_id;
end $$;

-- ─── Espiar: o que a página mostra antes da identidade ───────────────────────
-- Só a clínica e o que vai pedir. Nada da ficha: quem tem o link na mão pode
-- não ser a cliente.
create or replace function public.pre_atendimento_link_espiar(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_link public.pre_atendimento_links%rowtype;
  v_pre  public.pre_atendimentos%rowtype;
  v_cpf  text;
begin
  select * into v_link from public.pre_atendimento_links l where l.token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  select * into v_pre from public.pre_atendimentos p where p.id = v_link.pre_atendimento_id;
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g') into v_cpf from public.clients c where c.id = v_pre.client_id;
  return jsonb_build_object(
    'estado', case
      when v_link.used_at is not null or v_pre.status = 'RESPONDIDO' then 'usado'
      when v_link.revoked_at is not null then 'revogado'
      when v_link.expires_at < now() then 'vencido'
      when v_pre.status <> 'PENDENTE' then 'indisponivel'
      else 'valido' end,
    'clinica', coalesce(
      (select b.name from public.appointments a join public.branches b on b.id = a.branch_id where a.id = v_pre.appointment_id),
      (select t.name from public.tenants t where t.id = v_pre.tenant_id)),
    'pede', case when v_cpf <> '' then 'CPF' else 'NASCIMENTO' end);
end $$;

-- ─── Abrir: confere a identidade, conta as tentativas ────────────────────────
-- Devolve jsonb em vez de lançar: a tentativa errada TEM de ficar gravada, e
-- um RAISE desfaria a gravação junto.
create or replace function public.pre_atendimento_link_abrir(
  p_token_hash text, p_cpf text, p_nascimento date, p_ip inet
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_link     public.pre_atendimento_links%rowtype;
  v_pre      public.pre_atendimentos%rowtype;
  v_cpf      text;
  v_nasc     date;
  v_ok       boolean;
  v_erros_ip int;
begin
  select * into v_link from public.pre_atendimento_links l where l.token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('erro', 'invalido'); end if;
  if v_link.used_at is not null then return jsonb_build_object('erro', 'usado'); end if;
  if v_link.revoked_at is not null then return jsonb_build_object('erro', 'revogado'); end if;
  if v_link.expires_at < now() then return jsonb_build_object('erro', 'vencido'); end if;

  if p_ip is not null then
    select count(*) into v_erros_ip from public.pre_atendimento_link_attempts a
     where a.ip = p_ip and not a.ok and a.created_at > now() - interval '1 hour';
    if v_erros_ip >= 20 then return jsonb_build_object('erro', 'limite'); end if;
  end if;

  select * into v_pre from public.pre_atendimentos p where p.id = v_link.pre_atendimento_id;
  if v_pre.status = 'RESPONDIDO' then return jsonb_build_object('erro', 'usado'); end if;
  if v_pre.status <> 'PENDENTE' then return jsonb_build_object('erro', 'indisponivel'); end if;

  -- birth_date é timestamptz gravado à meia-noite UTC: o dia é o do UTC.
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g'), (c.birth_date at time zone 'UTC')::date
    into v_cpf, v_nasc
    from public.clients c where c.id = v_pre.client_id;

  if v_cpf <> '' then
    v_ok := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') = v_cpf;
  elsif v_nasc is not null then
    v_ok := p_nascimento is not null and p_nascimento = v_nasc;
  else
    return jsonb_build_object('erro', 'sem_identidade');
  end if;

  insert into public.pre_atendimento_link_attempts (link_id, ip, ok) values (v_link.id, p_ip, v_ok);

  if not v_ok then
    update public.pre_atendimento_links l
       set failed_attempts = l.failed_attempts + 1,
           revoked_at = case when l.failed_attempts + 1 >= 5 then now() else l.revoked_at end
     where l.id = v_link.id;
    return jsonb_build_object('erro', case when v_link.failed_attempts + 1 >= 5 then 'revogado' else 'identidade' end,
                              'restantes', greatest(0, 4 - v_link.failed_attempts));
  end if;

  return jsonb_build_object('ok', true, 'pre', v_pre.id, 'tenant', v_pre.tenant_id, 'cliente', v_pre.client_id, 'link', v_link.id);
end $$;

revoke execute on function public.pre_atendimento_link_criar(uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.pre_atendimento_link_espiar(text) from public, anon, authenticated;
revoke execute on function public.pre_atendimento_link_abrir(text, text, date, inet) from public, anon, authenticated;
grant execute on function public.pre_atendimento_link_criar(uuid, uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.pre_atendimento_link_espiar(text) to service_role;
grant execute on function public.pre_atendimento_link_abrir(text, text, date, inet) to service_role;

notify pgrst, 'reload schema';
