-- Os aniversariantes de um mês, para o Copilot (2026-10-08). No banco, e não
-- lendo a rede inteira no app: a leitura passaria de mil linhas e cortaria
-- (a mesma armadilha do §13.1). Só o servidor chama (service_role).
-- A data de nascimento é gravada como meia-noite UTC: o dia e o mês saem em UTC
-- (em Brasília, 10/05 00:00 UTC seria 09/05).

create or replace function public.copilot_aniversariantes(p_tenant uuid, p_mes integer, p_limite integer default 50)
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
  order by dia, c.name
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

revoke execute on function public.copilot_aniversariantes(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.copilot_aniversariantes(uuid, integer, integer) to service_role;

notify pgrst, 'reload schema';
