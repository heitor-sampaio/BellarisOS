-- A23–A25 da 26ª simulação (2026-11-18): a Auditoria (princípios 3 e 7).
--
-- A23: cada entrada da cliente no app e cada troca de unidade no portal
-- gravavam "Editou a ficha de X (última entrada no app, portal ultima
-- unidade)" — colunas de CONTROLE, que ninguém mexeu. Elas entram na lista
-- que o gatilho ignora (como o updated_at): a mudança só delas não gera linha,
-- e junto de outra coluna não aparece na frase. Troca de trecho no corpo VIVO
-- de private.auditar() (a lista é uma constante dele), com a conferência da
-- contagem; o SET plan_cache_mode do corpo vivo segue (pg_get_functiondef o traz),
-- e o alter do fim o reafirma (tests/auditoria-plano-generico.test.ts).
--
-- A25: "Editou a permissão do cargo X (nível)" quatro vezes, sem o módulo: o
-- gatilho de role_permissions guardava o módulo só quando ele mudava. O módulo
-- vira RÓTULO (vai em toda linha); o nível segue como valor (antes e depois
-- quando muda) — a frase diz "nível: Ver → Gerenciar". O alcance (scope) sai
-- dos valores: desde 23/11 não existe "só os meus" (CLAUDE.md §11), a coluna
-- guarda sempre 'ALL' (20261129000001) e não tem antes e depois a contar.
--
-- A24: a liberação do prontuário no pedido da LGPD saía "Editou o pedido de
-- LGPD (conclusão, arquivo exportado…)". O gatilho passa a guardar a decisão
-- (medical_status: approved/denied, sem dado pessoal) para a frase dizer
-- "Liberou"/"Recusou o prontuário no pedido da LGPD".

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar_no_corpo(
  'private.auditar()'::regprocedure,
  array[$t$v_ignorar     constant text[] := array['updated_at', 'atualizado_em', 'atualizada_em', 'updated_by'];$t$],
  array[$t$v_ignorar     constant text[] := array['updated_at', 'atualizado_em', 'atualizada_em', 'updated_by',
                                           'last_app_login_at', 'portal_ultima_entrada_em', 'portal_ultima_unidade'];$t$],
  array[1]
);

alter function private.auditar() set plan_cache_mode = force_generic_plan;

-- A25: o módulo da permissão em toda linha.
drop trigger if exists auditoria_ins on public.role_permissions;
drop trigger if exists auditoria_upd on public.role_permissions;
drop trigger if exists auditoria_del on public.role_permissions;
create trigger auditoria_ins after insert on public.role_permissions
  referencing new table as novas
  for each statement execute function private.auditar('normal', 'module', 'level', '', '');
create trigger auditoria_upd after update on public.role_permissions
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'module', 'level', '', '');
create trigger auditoria_del after delete on public.role_permissions
  referencing old table as velhas
  for each statement execute function private.auditar('normal', 'module', 'level', '', '');

-- A24: a decisão sobre o prontuário no pedido da LGPD.
drop trigger if exists auditoria_ins on public.lgpd_requests;
drop trigger if exists auditoria_upd on public.lgpd_requests;
drop trigger if exists auditoria_del on public.lgpd_requests;
create trigger auditoria_ins after insert on public.lgpd_requests
  referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,medical_status', '', '');
create trigger auditoria_upd after update on public.lgpd_requests
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,medical_status', '', '');
create trigger auditoria_del after delete on public.lgpd_requests
  referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'type,status,medical_status', '', '');

notify pgrst, 'reload schema';
