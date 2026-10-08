-- O CUSTO estimado do Copilot por rede e mês (2026-10-08, a tela "Uso do
-- Copilot" do sistema). A clínica calcula o custo de cada chamada em dólar
-- (o preço do modelo, de entrada e de saída: lib/planos/custo-do-copilot.ts)
-- e soma aqui, junto dos tokens.
--
-- Nulo = sem custo conhecido (o mês de antes desta coluna, ou um modelo fora
-- da tabela de preços): a tela mostra "—", não zero.

alter table public.copilot_uso_mensal add column if not exists custo_usd numeric(14, 6);

-- A assinatura nova tem o custo com padrão: a clínica que ainda não subiu
-- (chama só com p_tenant e p_tokens) continua funcionando no deploy.
drop function if exists public.copilot_registrar_uso(uuid, integer);
create or replace function public.copilot_registrar_uso(p_tenant uuid, p_tokens integer, p_custo_usd numeric default null)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.copilot_uso_mensal as u (tenant_id, mes, tokens, pedidos, custo_usd)
  values (p_tenant, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, greatest(p_tokens, 0), 1,
          case when p_custo_usd is null then null else greatest(p_custo_usd, 0) end)
  on conflict (tenant_id, mes) do update
    set tokens = u.tokens + greatest(excluded.tokens, 0),
        pedidos = u.pedidos + 1,
        custo_usd = case when excluded.custo_usd is null then u.custo_usd
                         else coalesce(u.custo_usd, 0) + excluded.custo_usd end
  returning tokens;
$$;

revoke execute on function public.copilot_registrar_uso(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.copilot_registrar_uso(uuid, integer, numeric) to service_role;

notify pgrst, 'reload schema';
