-- O aviso de pontos a vencer leva ao portal pela unidade dos PONTOS, não pela
-- de cadastro da ficha (auditoria das regras, 18/11; o Heitor: "o cliente não
-- é da unidade, o cliente é da rede" — H16; "Nada se prende a
-- clients.branch_id" — CLAUDE.md §5).
--
-- `avisos_de_vencimento` devolvia o slug de `clients.branch_id` (a unidade em
-- que a ficha nasceu) para o link do push. Agora: a unidade do lançamento de
-- pontos que vence na janela (a venda/o atendimento que os deu — o mais
-- recente), se ativa; senão a última unidade que ela usou no portal
-- (`clients.portal_ultima_unidade`, 20261124200003), se ativa; senão a primeira
-- ativa da rede por nome — o mesmo critério de `lib/clientes/unidade-do-portal.ts`.
-- O resto da função não muda.

create or replace function public.avisos_de_vencimento(p_agora timestamp with time zone default now(), p_tenant uuid default null::uuid)
 returns table(client_id uuid, pontos integer, ate timestamp with time zone, slug text)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_linha    record;
  v_ate      timestamptz;
  v_na_janela int;
  v_ja_avisado int;
begin
  for v_linha in
    select a.id as conta, a.client_id as cliente, a.aviso_vencimento_ate as avisado,
           cfg.expiry_notice_days as dias,
           coalesce(
             (select b1.slug
                from public.loyalty_transactions t
                join public.branches b1 on b1.id = t.branch_id and b1.is_active and b1.tenant_id = c.tenant_id
               where t.loyalty_account_id = a.id and t.expires_at is not null
                 and t.expires_at > p_agora
                 and t.expires_at <= p_agora + make_interval(days => cfg.expiry_notice_days)
               order by t.created_at desc
               limit 1),
             (select b2.slug from public.branches b2
               where b2.id = c.portal_ultima_unidade and b2.tenant_id = c.tenant_id and b2.is_active),
             (select b3.slug from public.branches b3
               where b3.tenant_id = c.tenant_id and b3.is_active order by b3.name, b3.id limit 1)
           ) as slug_da_unidade
      from public.loyalty_accounts a
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
     where cfg.enabled and cfg.expiry_months is not null and cfg.expiry_notice_days is not null
       and (p_tenant is null or c.tenant_id = p_tenant)
       and exists (select 1 from public.loyalty_transactions t
                    where t.loyalty_account_id = a.id and t.expires_at is not null
                      and t.expires_at > p_agora
                      and t.expires_at <= p_agora + make_interval(days => cfg.expiry_notice_days))
  loop
    v_ate := p_agora + make_interval(days => v_linha.dias);
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));

    v_na_janela  := public.fidelidade_a_expirar(v_linha.conta, v_ate);
    v_ja_avisado := public.fidelidade_a_expirar(v_linha.conta, coalesce(v_linha.avisado, p_agora));

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
$function$;

revoke all on function public.avisos_de_vencimento(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.avisos_de_vencimento(timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
