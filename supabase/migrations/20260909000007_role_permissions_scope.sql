-- Terceiro eixo do modelo de permissões: ESCOPO.
--
-- A matriz era cargo × módulo × nível. Faltava dizer "de quem": o "só os meus"
-- era derivado da heurística `provides_services && permissions.agenda <> 'MANAGE'`,
-- repetida em seis lugares do app. O efeito perverso era dar "Gerenciar" agenda
-- a um profissional para ele poder remarcar e, com isso, abrir a agenda de toda
-- a equipe para ele.
--
-- OWN = só os registros ligados ao próprio usuário (professional_id, owner_id).
-- ALL = tudo dentro da ABRANGÊNCIA do membro, que continua sendo `users.branch_id`
--       e não é atributo do cargo. São coisas diferentes e não se misturam.
--
-- Default ALL de propósito: escopo restringe, e restringir por omissão esconderia
-- dado sem ninguém ter pedido. Só os módulos onde a distinção existe de fato
-- (agenda, medical_records, financial, crm) mostram o seletor na tela de cargos.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'permission_scope') then
    create type public.permission_scope as enum ('OWN', 'ALL');
  end if;
end $$;

alter table public.role_permissions
  add column if not exists scope public.permission_scope not null default 'ALL';

notify pgrst, 'reload schema';
