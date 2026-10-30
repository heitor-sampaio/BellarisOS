-- D-3 (2026-10-30): a campanha é aviso no celular (push), e a tela diz
-- quantas clientes do público vão RECEBER — as que têm um aparelho
-- registrado (o app, em push_tokens, ou os avisos do navegador, em
-- web_push_subscriptions). É o mesmo critério do disparo
-- (lib/notifications/disparo-de-campanha.ts), que manda a cada aparelho pelo
-- client_id da ficha.
--
-- Conta no banco, sobre o mesmo público de clientes_do_publico: ler o público
-- no app e mandar os ids num .in() cortaria em 1000 (e estouraria a URL).
-- Comum (sem security definer) e só para o servidor, como clientes_do_publico.

create or replace function public.publico_com_aparelho(p_tenant uuid, p_filtros jsonb)
returns integer
language sql stable set search_path = '' as $$
  select count(*)::integer
  from public.clientes_do_publico(p_tenant, p_filtros) c
  where exists (select 1 from public.push_tokens t where t.client_id = c.id)
     or exists (select 1 from public.web_push_subscriptions w where w.client_id = c.id);
$$;

revoke execute on function public.publico_com_aparelho(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.publico_com_aparelho(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
