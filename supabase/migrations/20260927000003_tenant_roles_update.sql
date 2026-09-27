-- `tenant_roles` não tinha policy de UPDATE.
--
-- Com RLS ligada, todo `update` pela sessão atingia ZERO linhas e não dava
-- erro nenhum: renomear um cargo respondia "sucesso" e o nome continuava o
-- mesmo. Apareceu em 2026-09-27, quando gravar `inbox_caixas` passou a
-- conferir a linha devolvida (`.single()`) em vez de confiar no silêncio.
--
-- Mesmo molde da policy de DELETE: quem é da rede, na própria rede, e nunca um
-- cargo de sistema — o "Admin da rede" não se edita.

drop policy if exists tenant_roles_update on public.tenant_roles;
create policy tenant_roles_update on public.tenant_roles
  for update
  using (
    public.eh_da_rede()
    and tenant_id = (public.jwt_claim('tenant_id'))::uuid
    and is_system = false
  )
  with check (
    public.eh_da_rede()
    and tenant_id = (public.jwt_claim('tenant_id'))::uuid
    and is_system = false
  );
