-- O GERENTE da equipe da plataforma (2026-10-07, pedido do Heitor): vê o
-- sistema inteiro e não edita nada; o suporte não é dele. Quem barra é o app
-- (getPlatformContext por página e action, o proxy de cada host); aqui, o
-- papel passa a existir e a sessão de suporte (entrar na conta de um membro)
-- fica, também no banco, só com quem atende.

alter table public.platform_staff drop constraint if exists platform_staff_papel_check;
alter table public.platform_staff add constraint platform_staff_papel_check
  check (papel in ('SUPORTE', 'ADMIN', 'GERENTE'));

do $$
declare
  v_antes text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('public.suporte_sessao_abrir(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure);
  v_depois := replace(v_antes,
    $x$  if not exists (select 1 from public.platform_staff where id = p_staff and is_active) then
    raise exception 'Atendente inativo.';
  end if;$x$,
    $x$  if not exists (select 1 from public.platform_staff where id = p_staff and is_active) then
    raise exception 'Atendente inativo.';
  end if;
  -- Entrar na conta de um membro é do ATENDIMENTO (Suporte e Admin): o
  -- Gerente só vê o sistema (2026-10-07).
  if not exists (select 1 from public.platform_staff where id = p_staff and papel in ('SUPORTE', 'ADMIN')) then
    raise exception 'Só quem é do atendimento (Suporte ou Admin) abre sessão de suporte.';
  end if;$x$);
  if v_depois = v_antes then raise exception 'suporte_sessao_abrir: o trecho de referência mudou'; end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
