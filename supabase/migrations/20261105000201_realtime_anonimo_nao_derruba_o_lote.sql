-- F26 (3ª completa de 2026-11-05): a aba SEM sessão derrubava o tempo real de todos.
--
-- O cliente do Realtime no navegador fala como anônimo quando o servidor não dá
-- token (a sessão caiu, o membro foi desativado, o suporte encerrou) e a aba
-- segue inscrita. O Realtime confere a RLS de cada mudança para cada inscrito
-- NUM LOTE SÓ (realtime.list_changes → apply_rls), e descarta o lote inteiro
-- quando uma política estoura. Para o papel `anon` estouravam:
--   - appointments, clients, client_packages, client_notifications:
--     "permission denied for function clientes_do_login" (anon sem EXECUTE);
--   - medical_record_entries: idem, prontuario_da_minha_rede;
--   - user_notifications: "permission denied for schema private"
--     (suporte_encerrada lê private.suporte_estado_rapido).
-- Resultado: o agendamento ou a mensagem nova não chegava nem a quem estava
-- logado (logs do Realtime da completa: dezenas de PoolingReplicationError).
--
-- O conserto: as políticas de LEITURA (SELECT e ALL) das tabelas do Realtime
-- passam a valer só para `authenticated`. Para o anônimo nada muda no que ele
-- vê — todas dependem das claims da sessão e já davam falso ou estouravam —,
-- mas ele deixa de avaliá-las: sem política que se aplique, nenhuma linha, sem
-- erro. Abrir o schema `private` ao anônimo seria o caminho errado.
--
-- Prova: e2e/rls-realtime-sem-sessao.spec.ts.
do $$
declare
  p record;
begin
  for p in
    select pol.policyname, pol.schemaname, pol.tablename
    from pg_publication_tables pt
    join pg_policies pol on pol.schemaname = pt.schemaname and pol.tablename = pt.tablename
    where pt.pubname = 'supabase_realtime'
      and pol.cmd in ('SELECT', 'ALL')
      and pol.roles = '{public}'
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;
