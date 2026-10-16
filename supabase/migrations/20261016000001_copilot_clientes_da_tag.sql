-- Os clientes de uma tag, para o Copilot (2026-10-16).
--
-- Desde as tags da rede (20261013000006) "VIP" e "vip" são a MESMA tag — a
-- lista de clientes compara sem caixa. O Copilot filtrava por `tags @> {x}`,
-- que é exato: pedindo "Vip", não achava quem tem "vip". O filtro sem caixa
-- num array não se diz pelo PostgREST; fica aqui.
--
-- `p_tag_unidade` recorta pela tag da unidade ("Unidade: …"), exata: é o
-- sistema que a grava, sempre com o mesmo nome.

create or replace function public.copilot_clientes_da_tag(
  p_tenant uuid, p_tag text, p_tag_unidade text default null, p_limite integer default 50
)
returns table(id uuid, name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.phone
  from public.clients c
  where c.tenant_id = p_tenant
    and c.is_active
    and exists (select 1 from unnest(c.tags) t where lower(btrim(t)) = lower(btrim(p_tag)))
    and (p_tag_unidade is null or c.tags @> array[p_tag_unidade])
  order by c.name
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

revoke execute on function public.copilot_clientes_da_tag(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.copilot_clientes_da_tag(uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';
