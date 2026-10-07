-- Os BÔNUS da fidelidade (aniversário, primeiro acesso) também respeitam o
-- PLANO da rede (2026-10-06; private.rede_tem_recurso, migration
-- 20261006000004). Mesmo método: uma condição aplicada sobre a definição que
-- está no banco, e a migration falha se o trecho de referência mudou.
do $$
declare
  v_antes text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('public.fidelidade_bonus_aniversario(date, uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$     where cfg.enabled and cfg.birthday_bonus > 0$x$,
    $x$     where cfg.enabled and cfg.birthday_bonus > 0
       -- A fidelidade é do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(c.tenant_id, 'fidelidade')$x$);
  if v_depois = v_antes then raise exception 'fidelidade_bonus_aniversario: o trecho de referência mudou'; end if;
  execute v_depois;

  v_antes := pg_get_functiondef('public.fidelidade_primeiro_acesso(uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$where c.tenant_id = v_tenant and c.enabled;$x$,
    $x$where c.tenant_id = v_tenant and c.enabled
     and private.rede_tem_recurso(v_tenant, 'fidelidade');$x$);
  if v_depois = v_antes then raise exception 'fidelidade_primeiro_acesso: o trecho de referência mudou'; end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
