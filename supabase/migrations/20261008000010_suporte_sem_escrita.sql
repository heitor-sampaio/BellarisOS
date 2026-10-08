-- O "risco aceito" do suporte que virou trava (2026-10-08). Dentro da janela
-- autorizada, o atendente tem o token da sessão no navegador (o cookie é
-- httpOnly, mas o navegador é dele: as ferramentas de desenvolvedor mostram) e
-- falava direto com o PostgREST: GRAVAVA o que a RLS deixa ao membro, fora do
-- registro de acesso (`support_access_log`) e da marca "via suporte".
--
-- Agora a sessão de suporte não grava pelo PostgREST em tabela nenhuma: uma
-- política RESTRICTIVE para insert, update e delete em toda tabela de `public`
-- com RLS (soma-se por AND às que existem; não abre nada). O que o suporte
-- muda, muda pelo APP — o servidor grava pelo cliente de serviço, que não passa
-- pela RLS, depois de conferir permissão e alcance e com o registro. Ler
-- continua como era (o que a RLS deixa ao membro, menos o clínico).
--
-- O `session_id` primeiro: o token anônimo não o tem e não chega ao schema
-- `private` (sem uso dele, daria 42501).

create or replace function private.suporte_sem_escrita()
returns boolean
language sql
stable
set search_path = ''
as $$ select private.suporte_estado_rapido() <> '' $$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists suporte_sem_escrita_ins on public.%I', t);
    execute format('drop policy if exists suporte_sem_escrita_upd on public.%I', t);
    execute format('drop policy if exists suporte_sem_escrita_del on public.%I', t);
    execute format($p$create policy suporte_sem_escrita_ins on public.%I as restrictive for insert
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_upd on public.%I as restrictive for update
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_del on public.%I as restrictive for delete
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)$p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
