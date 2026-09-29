-- Fidelidade — opcionais da rede (decisão do Heitor, 2026-09-29): bônus de
-- aniversário, bônus de primeiro acesso, troca pelo próprio cliente no portal e
-- aviso de vencimento por push. Os quatro nascem DESLIGADOS e cada rede liga o
-- que quiser em Configurações → Fidelidade.
--
-- BÔNUS: lançamento BONUS, com `bonus_ref` único por conta — 'ANIVERSARIO:2026',
-- 'PRIMEIRO_ACESSO'. É a trava contra dar duas vezes (o cron roda de hora em
-- hora, e a pessoa pode entrar no portal por dois aparelhos ao mesmo tempo). O
-- bônus recebe a validade da rede como qualquer crédito.
--
-- PRIMEIRO ACESSO é o primeiro login do cliente, marcado em
-- clients.app_account_created_at (que existia e ninguém preenchia). Quem já
-- tinha entrado antes ganha a marca aqui, pelo auth — senão ganharia o bônus
-- de "primeiro acesso" no próximo login, anos depois do primeiro.
--
-- AVISO DE VENCIMENTO: `avisos_de_vencimento` REIVINDICA cada aviso antes de o
-- app enviar (grava até onde o aviso já cobriu, em
-- loyalty_accounts.aviso_vencimento_ate): duas passagens do cron não mandam o
-- mesmo push duas vezes. Um aviso novo só sai quando entram na janela pontos
-- que o anterior não cobria — a conta é a mesma forma fechada da expiração.

-- ─── Config ──────────────────────────────────────────────────────────────────
alter table public.loyalty_configs
  add column birthday_bonus      int     not null default 0,
  add column first_access_bonus  int     not null default 0,
  add column client_redeem       boolean not null default false,
  add column expiry_notice_days  int,
  add constraint loyalty_configs_birthday_bonus_check     check (birthday_bonus between 0 and 1000000),
  add constraint loyalty_configs_first_access_bonus_check check (first_access_bonus between 0 and 1000000),
  add constraint loyalty_configs_expiry_notice_days_check check (expiry_notice_days is null or expiry_notice_days between 1 and 90);

comment on column public.loyalty_configs.birthday_bonus     is 'Pontos no aniversário do cliente. 0 = desligado.';
comment on column public.loyalty_configs.first_access_bonus is 'Pontos no primeiro acesso ao portal/app. 0 = desligado.';
comment on column public.loyalty_configs.client_redeem      is 'O cliente troca pontos por recompensa pelo portal (além da equipe).';
comment on column public.loyalty_configs.expiry_notice_days is 'Avisa por push N dias antes de os pontos vencerem. Nulo = não avisa.';

-- ─── Extrato: o lançamento de bônus ──────────────────────────────────────────
alter table public.loyalty_transactions
  drop constraint loyalty_transactions_kind_check,
  add constraint loyalty_transactions_kind_check check (kind in (
    'GANHO', 'ESTORNO_GANHO', 'AJUSTE', 'RESGATE', 'ESTORNO_RESGATE',
    'VOUCHER', 'VOUCHER_CANCELADO', 'EXPIRACAO', 'BONUS'
  )),
  add column bonus_ref text;

create unique index uniq_fidelidade_bonus
  on public.loyalty_transactions (loyalty_account_id, bonus_ref)
  where bonus_ref is not null;

alter table public.loyalty_accounts add column aviso_vencimento_ate timestamptz;

-- Quem já entrou no portal antes desta migration tem o primeiro acesso no passado.
update public.clients c
   set app_account_created_at = coalesce(u.last_sign_in_at, u.created_at)
  from auth.users u
 where u.id::text = c.auth_id
   and c.app_account_created_at is null
   and u.last_sign_in_at is not null;

-- ─── Dar um bônus (uma vez por referência) ───────────────────────────────────
-- Devolve os pontos dados, ou 0 se o programa/bônus está desligado ou se essa
-- referência já foi dada. A unidade do lançamento é a do cliente; sem ela, a
-- primeira unidade ativa da rede.
create or replace function public.fidelidade_dar_bonus(p_cliente uuid, p_ref text, p_pontos int, p_descricao text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_unidade uuid;
  v_cfg     public.loyalty_configs%rowtype;
  v_conta   uuid;
  v_linhas  int;
begin
  if coalesce(p_pontos, 0) <= 0 then return 0; end if;
  select c.tenant_id, c.branch_id into v_tenant, v_unidade from public.clients c where c.id = p_cliente;
  if v_tenant is null then return 0; end if;
  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_tenant and c.enabled;
  if not found then return 0; end if;
  if v_unidade is null then
    select b.id into v_unidade from public.branches b
     where b.tenant_id = v_tenant and b.is_active order by b.created_at limit 1;
    if v_unidade is null then return 0; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));
  v_conta := public.fidelidade_conta(p_cliente);
  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description, bonus_ref, expires_at, created_by
  ) values (
    v_conta, v_unidade, 'BONUS', p_pontos, p_descricao, p_ref,
    case when v_cfg.expiry_months is null then null else now() + make_interval(months => v_cfg.expiry_months) end,
    'sistema'
  )
  on conflict (loyalty_account_id, bonus_ref) where bonus_ref is not null do nothing;
  get diagnostics v_linhas = row_count;
  return case when v_linhas > 0 then p_pontos else 0 end;
end;
$$;

-- ─── Primeiro acesso ─────────────────────────────────────────────────────────
-- Chamada no login do cliente. Marca o primeiro acesso (só se ainda não havia) e,
-- nesse caso, dá o bônus configurado. Devolve os pontos dados.
create or replace function public.fidelidade_primeiro_acesso(p_cliente uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid;
  v_bonus  int;
begin
  update public.clients c set app_account_created_at = now()
   where c.id = p_cliente and c.app_account_created_at is null
  returning c.tenant_id into v_tenant;
  if v_tenant is null then return 0; end if;   -- não era o primeiro
  select c.first_access_bonus into v_bonus from public.loyalty_configs c where c.tenant_id = v_tenant and c.enabled;
  return public.fidelidade_dar_bonus(p_cliente, 'PRIMEIRO_ACESSO', coalesce(v_bonus, 0), 'Bônus de primeiro acesso');
end;
$$;

-- ─── Aniversário ─────────────────────────────────────────────────────────────
-- Chamada pelo cron. `p_hoje` é o dia em São Paulo. Quem nasceu em 29/02 ganha
-- em 28/02 nos anos que não são bissextos. Devolve (cliente, pontos) de quem
-- ganhou AGORA — o app avisa por push.
create or replace function public.fidelidade_bonus_aniversario(p_hoje date)
returns table (client_id uuid, pontos int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha record;
  v_dados int;
  v_bissexto boolean := extract(day from (date_trunc('year', p_hoje) + interval '2 months' - interval '1 day')) = 29;
begin
  for v_linha in
    select c.id, cfg.birthday_bonus
      from public.clients c
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
     where cfg.enabled and cfg.birthday_bonus > 0
       and c.birth_date is not null
       and (
         (extract(month from (c.birth_date at time zone 'UTC')::date) = extract(month from p_hoje)
          and extract(day from (c.birth_date at time zone 'UTC')::date) = extract(day from p_hoje))
         or (not v_bissexto and extract(month from p_hoje) = 2 and extract(day from p_hoje) = 28
             and extract(month from (c.birth_date at time zone 'UTC')::date) = 2 and extract(day from (c.birth_date at time zone 'UTC')::date) = 29)
       )
  loop
    v_dados := public.fidelidade_dar_bonus(
      v_linha.id, 'ANIVERSARIO:' || extract(year from p_hoje)::int, v_linha.birthday_bonus, 'Bônus de aniversário');
    if v_dados > 0 then
      client_id := v_linha.id; pontos := v_dados;
      return next;
    end if;
  end loop;
end;
$$;

-- ─── Avisos de vencimento ────────────────────────────────────────────────────
-- Chamada pelo cron DEPOIS de expirar_pontos. Reivindica e devolve quem avisar:
-- contas com pontos vencendo até agora + N dias que o último aviso não cobria.
-- `pontos` = o que vence na janela; `ate` = o fim dela; `slug` = a unidade do
-- cliente (o link do push).
create or replace function public.avisos_de_vencimento(p_agora timestamptz default now())
returns table (client_id uuid, pontos int, ate timestamptz, slug text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha    record;
  v_ate      timestamptz;
  v_na_janela int;
  v_ja_avisado int;
begin
  for v_linha in
    select a.id as conta, a.client_id as cliente, a.aviso_vencimento_ate as avisado,
           cfg.expiry_notice_days as dias, cfg.scope_per_branch as por_unidade,
           coalesce(b.slug, (select b2.slug from public.branches b2
                              where b2.tenant_id = c.tenant_id and b2.is_active order by b2.created_at limit 1)) as slug_da_unidade
      from public.loyalty_accounts a
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
      left join public.branches b on b.id = c.branch_id
     where cfg.enabled and cfg.expiry_months is not null and cfg.expiry_notice_days is not null
       and exists (select 1 from public.loyalty_transactions t
                    where t.loyalty_account_id = a.id and t.expires_at is not null
                      and t.expires_at > p_agora
                      and t.expires_at <= p_agora + make_interval(days => cfg.expiry_notice_days))
  loop
    v_ate := p_agora + make_interval(days => v_linha.dias);
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));

    if v_linha.por_unidade then
      select coalesce(sum(public.fidelidade_a_expirar(v_linha.conta, u.branch_id, v_ate)), 0),
             coalesce(sum(public.fidelidade_a_expirar(v_linha.conta, u.branch_id, coalesce(v_linha.avisado, p_agora))), 0)
        into v_na_janela, v_ja_avisado
        from (select distinct t.branch_id from public.loyalty_transactions t where t.loyalty_account_id = v_linha.conta) u;
    else
      v_na_janela  := public.fidelidade_a_expirar(v_linha.conta, null, v_ate);
      v_ja_avisado := public.fidelidade_a_expirar(v_linha.conta, null, coalesce(v_linha.avisado, p_agora));
    end if;

    if v_na_janela > v_ja_avisado then
      update public.loyalty_accounts a set aviso_vencimento_ate = v_ate
       where a.id = v_linha.conta and a.aviso_vencimento_ate is not distinct from v_linha.avisado;
      if found then
        client_id := v_linha.cliente; pontos := v_na_janela; ate := v_ate; slug := v_linha.slug_da_unidade;
        return next;
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.fidelidade_dar_bonus(uuid, text, int, text) from public, anon, authenticated;
revoke execute on function public.fidelidade_primeiro_acesso(uuid)           from public, anon, authenticated;
revoke execute on function public.fidelidade_bonus_aniversario(date)          from public, anon, authenticated;
revoke execute on function public.avisos_de_vencimento(timestamptz)          from public, anon, authenticated;
grant  execute on function public.fidelidade_dar_bonus(uuid, text, int, text) to service_role;
grant  execute on function public.fidelidade_primeiro_acesso(uuid)           to service_role;
grant  execute on function public.fidelidade_bonus_aniversario(date)          to service_role;
grant  execute on function public.avisos_de_vencimento(timestamptz)          to service_role;

notify pgrst, 'reload schema';
