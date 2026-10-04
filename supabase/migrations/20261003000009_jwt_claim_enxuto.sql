-- jwt_claim enxuto (2026-10-03).
--
-- Medido no banco, 20 mil chamadas por linha: a versão da fase 2 (consulta a
-- support_sessions a cada chamada) levava ~2,8 s; a de 20261003000008 (estado
-- em cache por transação, mas três funções encadeadas) ~680 ms; esta, numa
-- função só que lê o cache direto, ~120 ms — contra ~35 ms do `auth.jwt()`
-- puro. A consulta à tabela acontece uma vez por transação (private.suporte_estado).
--
-- NÃO é security definer de propósito: sem `session_id` no token (o `anon`,
-- o service role) o ramo do suporte nem executa, e o `anon` não precisa de
-- acesso ao schema private — antes ele recebia 42501 em vez de nada.

create or replace function public.jwt_claim(claim text)
returns text language plpgsql stable set search_path = ''
as $$
declare v_j jsonb := auth.jwt(); v_sid text := v_j ->> 'session_id'; v_c text;
begin
  if v_sid is not null and v_sid <> '' then
    v_c := current_setting('bellaris.suporte', true);
    if v_c is null or v_c not like v_sid || ':%' then
      perform private.suporte_estado();
      v_c := current_setting('bellaris.suporte', true);
    end if;
    -- Sessão de suporte encerrada ou vencida: nenhum claim, toda política nega.
    if substr(v_c, length(v_sid) + 2, 1) = 'e' then return null; end if;
  end if;
  return v_j -> 'app_metadata' ->> claim;
end $$;

-- O mesmo atalho para as perguntas das políticas restritivas.
create or replace function private.suporte_estado_rapido()
returns text language plpgsql stable set search_path = ''
as $$
declare v_sid text := nullif(auth.jwt() ->> 'session_id', ''); v_c text;
begin
  if v_sid is null then return ''; end if;
  v_c := current_setting('bellaris.suporte', true);
  if v_c is null or v_c not like v_sid || ':%' then return private.suporte_estado(); end if;
  return substr(v_c, length(v_sid) + 2);
end $$;

create or replace function private.suporte_encerrada()
returns boolean language sql stable set search_path = ''
as $$ select left(private.suporte_estado_rapido(), 1) = 'e' $$;

create or replace function private.suporte_sem_clinico()
returns boolean language sql stable set search_path = ''
as $$ select right(private.suporte_estado_rapido(), 1) = 's' $$;

create or replace function private.em_suporte()
returns boolean language sql stable set search_path = ''
as $$ select private.suporte_estado_rapido() <> '' $$;

drop function if exists public.jwt_claim_teste(text);

notify pgrst, 'reload schema';
