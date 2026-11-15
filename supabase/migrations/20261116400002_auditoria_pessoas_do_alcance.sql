-- D7 da 15ª simulação (2026-11-15): o filtro "Quem" da Auditoria, para quem
-- tem unidades, eram os membros com users.branch_id nelas — ficava de fora
-- quem tem "A rede inteira" (branch_id nulo), e quem tem a unidade em
-- outras_unidades. As linhas que a pessoa lê tinham ações dessas pessoas, e o
-- filtro não as oferecia.
--
-- A lista sai das LINHAS que a pessoa alcança: os membros da rede que agiram
-- em alguma das unidades dela (o mesmo recorte de lerAuditoria). Quem é da
-- rede inteira segue com a lista de todos os membros (lib/auditoria/leitura.ts).
--
-- Recebe a rede por parâmetro: só o servidor chama (CLAUDE.md §4).

create or replace function public.auditoria_pessoas_das_unidades(p_tenant uuid, p_unidades uuid[])
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name
    from public.users u
   where u.tenant_id = p_tenant
     and exists (
       select 1 from public.auditoria a
        where a.tenant_id = p_tenant
          and a.ator_user_id = u.id
          and a.branch_id = any (p_unidades)
     )
   order by u.name, u.id
$$;

revoke execute on function public.auditoria_pessoas_das_unidades(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.auditoria_pessoas_das_unidades(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
