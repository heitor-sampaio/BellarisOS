-- O funil padrão nasce numa transação só (2026-10-27, frente 9).
--
-- `seedDefaultFunnel` inseria o funil e depois as etapas, em duas idas ao
-- banco. Dois primeiros acessos juntos (quadro, dashboard e inbox abrem na
-- mesma hora) batiam no índice `uq_crm_funnels_default` — "duplicate key" no
-- log a cada corrida (visto no crm-atritos) — e um processo que caísse entre
-- as duas idas deixava a rede com um funil sem etapa nenhuma.
--
-- Aqui: a rede é TRAVADA (advisory lock da transação), e quem chega depois
-- espera e encontra o funil já completo. Sem funil nenhum na rede, cria o
-- padrão e as etapas juntos; com qualquer funil, só devolve os que existem.
-- O app manda o nome e as etapas (`DEFAULT_STAGES`, lib/crm.ts): a regra fica
-- no TypeScript, a função só grava.
--
-- Recebe a rede por parâmetro: só o servidor (service_role) a chama — o
-- `seedDefaultFunnel` passa `ctx.tenantId`, nunca um id do navegador.

create or replace function public.crm_funil_padrao(p_tenant uuid, p_nome text, p_etapas jsonb)
returns setof public.crm_funnels
language plpgsql
set search_path = public
as $$
declare
  v_funil uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('crm_funil_padrao:' || p_tenant::text, 0));

  if not exists (select 1 from public.crm_funnels f where f.tenant_id = p_tenant) then
    insert into public.crm_funnels (tenant_id, name, is_default, position)
    values (p_tenant, p_nome, true, 0)
    returning id into v_funil;

    insert into public.crm_stages (tenant_id, funnel_id, name, color, position, outcome, marca)
    select p_tenant, v_funil, e->>'name', e->>'color', (e->>'position')::smallint,
           coalesce(e->>'outcome', 'OPEN'), nullif(e->>'marca', '')
      from jsonb_array_elements(p_etapas) e;
  end if;

  return query
    select * from public.crm_funnels f where f.tenant_id = p_tenant order by f.position;
end;
$$;

revoke execute on function public.crm_funil_padrao(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.crm_funil_padrao(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
