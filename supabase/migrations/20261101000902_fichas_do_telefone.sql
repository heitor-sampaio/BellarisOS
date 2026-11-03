-- As fichas da rede com este telefone — ativas e ARQUIVADAS (A20 da 5ª
-- simulação, 2026-11-01): o cadastro de "Valdir Duplicado" não avisou que o
-- telefone era de uma ficha arquivada. `cliente_por_telefone` devolve só a
-- mais antiga, sem dizer se está arquivada; o cadastro precisa de todas para
-- perguntar na ordem certa (a arquivada oferece "Reativar"; a rápida, "é a
-- mesma pessoa?"; a outra ativa, "cadastrar mesmo assim").
-- A comparação é a de `cliente_por_telefone`: os 8 últimos dígitos.

create or replace function public.fichas_do_telefone(p_tenant uuid, p_digitos text)
returns table (id uuid, nome text, ativa boolean, sem_cpf boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.is_active, c.document is null
  from clients c
  where c.tenant_id = p_tenant
    and length(regexp_replace(p_digitos, '\D', '', 'g')) >= 8
    and right(regexp_replace(c.phone, '\D', '', 'g'), 8)
      = right(regexp_replace(p_digitos, '\D', '', 'g'), 8)
  order by c.created_at, c.id
  limit 20
$$;

comment on function public.fichas_do_telefone(uuid, text) is
  'As fichas da rede com este telefone (8 últimos dígitos), ativas e arquivadas, da mais antiga (A20). Só o servidor.';

revoke execute on function public.fichas_do_telefone(uuid, text) from public, anon, authenticated;
grant  execute on function public.fichas_do_telefone(uuid, text) to service_role;

notify pgrst, 'reload schema';
