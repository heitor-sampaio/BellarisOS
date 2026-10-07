-- O PLANO da rede também vale no que o BANCO faz sozinho (2026-10-06):
-- o ponto de fidelidade no pagamento e o termo/contrato no agendamento.
-- O catálogo mora em packages/nucleo/src/lib/planos/recursos.ts; o retrato,
-- em tenant_subscriptions.recursos (NULL = sem plano = tudo liberado).

create or replace function private.rede_tem_recurso(p_tenant uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.recursos is null or (s.recursos -> 'funcionalidades') ? p_chave
       from public.tenant_subscriptions s where s.tenant_id = p_tenant),
    true)
$$;
revoke execute on function private.rede_tem_recurso(uuid, text) from public, anon, authenticated;
grant execute on function private.rede_tem_recurso(uuid, text) to service_role;

-- As duas funções ganham UMA condição cada, aplicada sobre a definição que
-- está no banco (a forma completa vive nas migrations de origem:
-- 20260929000001 a da fidelidade, e a dos documentos de 2026-09-30). Se o
-- texto de referência mudar, a migration FALHA em vez de seguir sem a trava.
do $$
declare
  v_antes text;
  v_depois text;
begin
  -- Fidelidade: o gatilho do pagamento só dá ponto com o programa no plano.
  v_antes := pg_get_functiondef('public.on_transaction_loyalty_earn()'::regprocedure);
  v_depois := replace(v_antes,
    $x$  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_rede and c.enabled;
  if not found then return null; end if;$x$,
    $x$  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_rede and c.enabled;
  if not found then return null; end if;
  -- A fidelidade é do PLANO da rede (lib/planos/recursos.ts).
  if not private.rede_tem_recurso(v_rede, 'fidelidade') then return null; end if;$x$);
  if v_depois = v_antes then raise exception 'on_transaction_loyalty_earn: o trecho de referência mudou'; end if;
  execute v_depois;

  -- Documentos: a emissão do atendimento só sai com termos e contratos no plano.
  v_antes := pg_get_functiondef('public.documentos_emitir_do_atendimento(uuid, text[])'::regprocedure);
  v_depois := replace(v_antes,
    $x$       and a.status not in ('CANCELLED', 'NO_SHOW')$x$,
    $x$       and a.status not in ('CANCELLED', 'NO_SHOW')
       -- Termos e contratos são do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(b.tenant_id, 'documentos')$x$);
  if v_depois = v_antes then raise exception 'documentos_emitir_do_atendimento: o trecho de referência mudou'; end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
