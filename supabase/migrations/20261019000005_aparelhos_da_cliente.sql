-- Os aparelhos da cliente que recebem o aviso de uma ficha (2026-10-19).
--
-- A mesma pessoa pode ser cliente de várias clínicas com um login só, e o
-- aparelho (FCM do app, inscrição de web push do navegador) fica registrado
-- pela ficha da clínica em que ela estava. O aviso de QUALQUER clínica dela
-- tem de chegar nele: os aparelhos de todas as fichas do MESMO login — e só
-- dele. Ficha sem login: os aparelhos dela mesma, como antes.
--
-- Quem chama é o servidor (`notifyClient`): só service role.

create or replace function public.aparelhos_da_cliente(p_cliente uuid)
returns table (token text, endpoint text, keys jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with dela as (
    select p_cliente as id
    union
    select c2.id
      from public.clients c1
      join public.clients c2 on c2.auth_id = c1.auth_id
     where c1.id = p_cliente and c1.auth_id is not null
  )
  select t.token, null::text, null::jsonb
    from public.push_tokens t
   where t.client_id in (select id from dela)
  union all
  select distinct on (s.endpoint) null::text, s.endpoint, s.keys
    from public.web_push_subscriptions s
   where s.client_id in (select id from dela)
$$;

revoke execute on function public.aparelhos_da_cliente(uuid) from public, anon, authenticated;
grant execute on function public.aparelhos_da_cliente(uuid) to service_role;

notify pgrst, 'reload schema';
