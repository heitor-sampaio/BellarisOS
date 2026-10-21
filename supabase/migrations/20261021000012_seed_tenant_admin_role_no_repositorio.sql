-- O corpo de seed_tenant_admin_role, que existia só no banco (2026-10-21; a
-- simulação de um dia de clínica notou: o gatilho que dá à rede nova o cargo
-- "Admin da rede" não estava em nenhuma migration — só o revoke de
-- 20260722000004). Este arquivo registra a função e o gatilho EXATAMENTE como
-- estão em produção; aplicá-lo de novo não muda nada.
--
-- O cargo NETWORK_ADMIN é o do sistema (is_system): os demais cargos prontos
-- são os modelos editáveis de private.cargos_modelo_semear (2026-10-21).

create or replace function public.seed_tenant_admin_role()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.tenant_roles (tenant_id, key, label, is_system)
  values (new.id, 'NETWORK_ADMIN', 'Admin da rede', true)
  on conflict (tenant_id, key) do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_seed_tenant_admin_role on public.tenants;
create trigger trg_seed_tenant_admin_role
  after insert on public.tenants
  for each row execute function public.seed_tenant_admin_role();

revoke execute on function public.seed_tenant_admin_role() from public, anon, authenticated;

notify pgrst, 'reload schema';
