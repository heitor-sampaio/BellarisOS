-- Busca de cliente por nome OU telefone, comparando telefone só pelos dígitos.
--
-- `clients.phone` guarda o que foi digitado: "(47) 99123-4567" no formulário,
-- "5544988887777" quando veio do WhatsApp. Procurar "47991234567" não achava
-- nenhum dos dois — e quem está com a pessoa ao telefone busca pelo número.

create or replace function public.buscar_clientes(
  p_tenant uuid,
  p_termo  text,
  p_limite int default 10
)
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.phone
  from clients c
  where c.tenant_id = p_tenant
    and c.is_active
    and (
      c.name ilike '%' || p_termo || '%'
      or (
        length(regexp_replace(p_termo, '\D', '', 'g')) >= 3
        and regexp_replace(c.phone, '\D', '', 'g')
            like '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'
      )
    )
  order by c.name
  limit greatest(1, least(p_limite, 50))
$$;

comment on function public.buscar_clientes is
  'Clientes da rede que casam com o termo (nome ou telefone por dígitos). Usada pela busca do agendamento.';

-- Recebe o tenant por parâmetro e roda como definer: só o servidor chama.
revoke execute on function public.buscar_clientes(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.buscar_clientes(uuid, text, int) to service_role;
