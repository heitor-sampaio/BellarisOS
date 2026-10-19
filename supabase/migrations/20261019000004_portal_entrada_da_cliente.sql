-- Para onde a cliente de várias clínicas vai depois do login (2026-10-19,
-- decisão do Heitor): no primeiro login com mais de uma clínica, o seletor;
-- depois, a última que usou (lib/clientes/entrada.ts).
--
--   portal_ligado_em          quando a ficha ganhou o login (o gatilho marca);
--   portal_ultima_entrada_em  quando ela abriu o portal desta clínica pela
--                             última vez (o layout do portal grava, com folga).
--
-- Uma clínica ligada DEPOIS da última entrada traz o seletor de volta, uma vez.

alter table public.clients add column if not exists portal_ligado_em timestamptz;
alter table public.clients add column if not exists portal_ultima_entrada_em timestamptz;

-- As fichas que já tinham login: ligadas "desde sempre" (o primeiro acesso,
-- ou o cadastro) — não trazem o seletor de volta.
update public.clients
   set portal_ligado_em = coalesce(app_account_created_at, created_at)
 where auth_id is not null and portal_ligado_em is null;

create or replace function private.trg_portal_ligado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_id is not null and (tg_op = 'INSERT' or old.auth_id is distinct from new.auth_id) then
    new.portal_ligado_em := now();
  end if;
  return new;
end $$;

create trigger trg_portal_ligado_em
  before insert or update of auth_id on public.clients
  for each row execute function private.trg_portal_ligado_em();
