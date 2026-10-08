-- Os aniversariantes do Copilot também por UNIDADE (2026-10-08, revisão da
-- fase 3): a lista de clientes da unidade recorta pela tag da unidade
-- (unitTag), e a ferramenta afirmava "da unidade X" com a rede inteira.

drop function if exists public.copilot_aniversariantes(uuid, integer, integer);

create or replace function public.copilot_aniversariantes(p_tenant uuid, p_mes integer, p_limite integer default 50, p_tag text default null)
returns table(id uuid, name text, phone text, dia integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.phone, extract(day from c.birth_date at time zone 'UTC')::int as dia
  from public.clients c
  where c.tenant_id = p_tenant
    and c.is_active
    and c.birth_date is not null
    and extract(month from c.birth_date at time zone 'UTC')::int = p_mes
    and (p_tag is null or coalesce(c.tags, '{}'::text[]) @> array[p_tag])
  order by dia, c.name
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

revoke execute on function public.copilot_aniversariantes(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.copilot_aniversariantes(uuid, integer, integer, text) to service_role;

notify pgrst, 'reload schema';
