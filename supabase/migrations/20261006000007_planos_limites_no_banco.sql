-- O que a verificação independente achou nas fases 3–5 dos planos (2026-10-06).

-- 1. rede_tem_recurso igual a lerRecursos (lib/planos/recursos.ts): retrato
--    sem a lista de funcionalidades = nenhuma (o app fecha; o banco abria).
create or replace function private.rede_tem_recurso(p_tenant uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.recursos is null or coalesce((s.recursos -> 'funcionalidades') ? p_chave, false)
       from public.tenant_subscriptions s where s.tenant_id = p_tenant),
    true)
$$;
revoke execute on function private.rede_tem_recurso(uuid, text) from public, anon, authenticated;
grant execute on function private.rede_tem_recurso(uuid, text) to service_role;

-- 2. O LIMITE do plano garantido no BANCO. O app confere antes (é ele que dá
--    a mensagem), mas a linha da uazapi e do cadastro incorporado nasce
--    INATIVA e é ligada depois, e dois cliques ao mesmo tempo contavam o
--    mesmo número. Toda linha que FICA ativa (insert ativo, ou update de
--    inativa para ativa) trava a rede, conta os ativos e confere o retrato.
create or replace function private.limite_do_plano()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave  text;
  v_limite int;
  v_ativos int;
  v_um     text;
  v_varios text;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;

  v_chave := case tg_table_name when 'branches' then 'unidades' when 'users' then 'membros' else 'whatsapp' end;
  select (s.recursos -> 'limites' ->> v_chave)::int into v_limite
    from public.tenant_subscriptions s where s.tenant_id = new.tenant_id;
  if v_limite is null then return new; end if;

  -- Uma por rede e por limite: a segunda transação espera a primeira e conta
  -- o que ela gravou.
  perform pg_advisory_xact_lock(hashtext('limite:' || new.tenant_id::text || ':' || v_chave));
  execute format('select count(*) from public.%I where tenant_id = $1 and is_active and id <> $2', tg_table_name)
    into v_ativos using new.tenant_id, new.id;

  if v_ativos + 1 > v_limite then
    v_um     := case v_chave when 'unidades' then 'unidade' when 'membros' then 'membro na equipe' else 'número de WhatsApp' end;
    v_varios := case v_chave when 'unidades' then 'unidades' when 'membros' then 'membros na equipe' else 'números de WhatsApp' end;
    raise exception using
      errcode = 'P0001',
      message = format('O plano da sua rede permite até %s %s. Para ampliar, fale com o BellarisOS.',
                       v_limite, case when v_limite = 1 then v_um else v_varios end),
      hint    = 'BELLARIS_LIMITE_DO_PLANO';
  end if;
  return new;
end $$;

drop trigger if exists trg_limite_do_plano on public.branches;
create trigger trg_limite_do_plano before insert or update of is_active on public.branches
  for each row execute function private.limite_do_plano();
drop trigger if exists trg_limite_do_plano on public.users;
create trigger trg_limite_do_plano before insert or update of is_active on public.users
  for each row execute function private.limite_do_plano();
drop trigger if exists trg_limite_do_plano on public.whatsapp_numbers;
create trigger trg_limite_do_plano before insert or update of is_active on public.whatsapp_numbers
  for each row execute function private.limite_do_plano();

-- 3. Documentos fora do plano não travam nada: o contrato do plano de
--    tratamento não é emitido, e o pendente (atendimento ou plano) não conta —
--    sem o módulo, ninguém conseguiria assinar nem dispensar. Mesmo método da
--    20261006000004: uma condição sobre a definição no banco; falha se o
--    trecho de referência mudou.
do $$
declare
  v_antes text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('public.documentos_emitir_do_plano(uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$     where tp.id = p_plano
    on conflict$x$,
    $x$     where tp.id = p_plano
       -- Termos e contratos são do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
    on conflict$x$);
  if v_depois = v_antes then raise exception 'documentos_emitir_do_plano: o trecho de referência mudou'; end if;
  execute v_depois;

  v_antes := pg_get_functiondef('public.documentos_pendentes_do_atendimento(uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')$x$,
    $x$     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
     and private.rede_tem_recurso(d.tenant_id, 'documentos')$x$);
  if v_depois = v_antes then raise exception 'documentos_pendentes_do_atendimento: o trecho de referência mudou'; end if;
  execute v_depois;

  v_antes := pg_get_functiondef('public.documentos_pendentes_do_plano(uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')$x$,
    $x$     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
     and private.rede_tem_recurso(d.tenant_id, 'documentos')$x$);
  if v_depois = v_antes then raise exception 'documentos_pendentes_do_plano: o trecho de referência mudou'; end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
