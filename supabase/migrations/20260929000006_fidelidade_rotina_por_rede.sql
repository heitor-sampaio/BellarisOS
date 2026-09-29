-- Fidelidade — as três funções da rotina (expirar, aniversário, aviso) ganham
-- um recorte OPCIONAL de rede (`p_tenant`, nulo = todas, que é o que o cron usa).
--
-- Por quê: o E2E roda contra o banco da produção e precisa chamar essas funções
-- com datas escolhidas à mão ("e se hoje fosse 2027-03-02?"). Sem recorte, a
-- chamada do teste vale para TODAS as redes: no dia em que uma rede real ligar o
-- programa, o teste venceria os pontos dos clientes dela antes da hora, daria
-- bônus de aniversário fora do dia e reivindicaria (engolindo) os avisos de
-- vencimento deles. Hoje nenhuma rede real tem o programa ligado; a trava entra
-- antes disso.
--
-- Mudar a lista de parâmetros cria outra função (sobrecarga), então as antigas
-- saem. Os corpos são os de 20260929000004 e 20260929000005 com o filtro a mais.

drop function if exists public.expirar_pontos(timestamptz);
drop function if exists public.fidelidade_bonus_aniversario(date);
drop function if exists public.avisos_de_vencimento(timestamptz);

create function public.expirar_pontos(p_ate timestamptz default now(), p_tenant uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha record;
  v_qtd   int;
  v_total int := 0;
begin
  for v_linha in
    select distinct a.id as conta, a.client_id as cliente,
           case when cfg.scope_per_branch then t.branch_id else null end as unidade
      from public.loyalty_transactions t
      join public.loyalty_accounts a on a.id = t.loyalty_account_id
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
     where cfg.enabled and cfg.expiry_months is not null
       and (p_tenant is null or c.tenant_id = p_tenant)
       and t.expires_at is not null and t.expires_at <= p_ate
  loop
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));
    v_qtd := public.fidelidade_a_expirar(v_linha.conta, v_linha.unidade, p_ate);
    if v_qtd > 0 then
      insert into public.loyalty_transactions (loyalty_account_id, branch_id, kind, points, description, created_by)
      values (
        v_linha.conta,
        coalesce(v_linha.unidade, (
          select t2.branch_id from public.loyalty_transactions t2
           where t2.loyalty_account_id = v_linha.conta
           order by t2.created_at desc limit 1)),
        'EXPIRACAO', -v_qtd, 'Pontos vencidos', 'sistema'
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

create function public.fidelidade_bonus_aniversario(p_hoje date, p_tenant uuid default null)
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
       and (p_tenant is null or c.tenant_id = p_tenant)
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

create function public.avisos_de_vencimento(p_agora timestamptz default now(), p_tenant uuid default null)
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
       and (p_tenant is null or c.tenant_id = p_tenant)
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

revoke execute on function public.expirar_pontos(timestamptz, uuid)               from public, anon, authenticated;
revoke execute on function public.fidelidade_bonus_aniversario(date, uuid)         from public, anon, authenticated;
revoke execute on function public.avisos_de_vencimento(timestamptz, uuid)         from public, anon, authenticated;
grant  execute on function public.expirar_pontos(timestamptz, uuid)               to service_role;
grant  execute on function public.fidelidade_bonus_aniversario(date, uuid)         to service_role;
grant  execute on function public.avisos_de_vencimento(timestamptz, uuid)         to service_role;

notify pgrst, 'reload schema';
