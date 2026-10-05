-- O Realtime guarda as claims com os NULOS virados TEXTO.
--
-- Visto em 2026-10-05, em realtime.subscription de um membro de rede:
--   app_metadata: {"tenant_id": "<uuid>", "branch_id": "null", "client_id": "null", "role_id": "null"}
-- No PostgREST o mesmo token traz `null` JSON, e `->>` devolve NULL. Dentro do
-- Realtime, `jwt_claim('client_id')` devolvia a STRING 'null': `eh_da_rede()`
-- dava falso, `can_access_branch` caía no ramo da unidade e `'null'::uuid`
-- estourava (22P02) — e o Realtime descarta o LOTE inteiro de mudanças em que
-- isso acontece (PoolingReplicationError em `list_changes`), para TODOS os
-- inscritos, não só para quem tem a claim. Era o quadro de oportunidades que
-- não atualizava sozinho no E2E (e qualquer tela com tempo real em produção,
-- sempre que um membro da rede estivesse com a tela aberta).
--
-- A regra: claim com o texto 'null' é nula. Nenhum valor legítimo de claim é
-- esse texto. O mesmo vale para o `session_id` lido nas funções do suporte,
-- que fazem `::uuid` com ele.

create or replace function public.jwt_claim(claim text)
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_j jsonb := auth.jwt();
  v_sid text := nullif(nullif(v_j ->> 'session_id', ''), 'null');
  v_tid text := nullif(nullif(v_j -> 'app_metadata' ->> 'tenant_id', ''), 'null');
  v_c text;
begin
  if v_sid is not null then
    v_c := current_setting('bellaris.suporte', true);
    if v_c is null or v_c not like v_sid || ':%' then
      perform private.suporte_estado();
      v_c := current_setting('bellaris.suporte', true);
    end if;
    if substr(v_c, length(v_sid) + 2, 1) = 'e' then return null; end if;
  end if;
  if v_tid is not null then
    v_c := current_setting('bellaris.rede', true);
    if v_c is null or v_c not like v_tid || ':%' then
      perform private.rede_estado(v_tid);
      v_c := current_setting('bellaris.rede', true);
    end if;
    if substr(v_c, length(v_tid) + 2, 1) = 'b' then return null; end if;
  end if;
  return nullif(v_j -> 'app_metadata' ->> claim, 'null');
end $function$;

create or replace function private.suporte_estado()
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_sid   text := nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null');
  v_cache text;
  v_est   text;
begin
  if v_sid is null then return ''; end if;
  v_cache := current_setting('bellaris.suporte', true);
  if v_cache is not null and v_cache like v_sid || ':%' then
    return substr(v_cache, length(v_sid) + 2);
  end if;
  select (case when s.status = 'ativa' and s.expires_at > now() then 'a' else 'e' end)
      || (case when s.includes_clinical then 'c' else 's' end)
    into v_est
    from public.support_sessions s
   where s.auth_session_id = v_sid::uuid;
  v_est := coalesce(v_est, '');
  perform set_config('bellaris.suporte', v_sid || ':' || v_est, true);
  return v_est;
end $function$;

create or replace function private.suporte_estado_rapido()
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare v_sid text := nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null'); v_c text;
begin
  if v_sid is null then return ''; end if;
  v_c := current_setting('bellaris.suporte', true);
  if v_c is null or v_c not like v_sid || ':%' then return private.suporte_estado(); end if;
  return substr(v_c, length(v_sid) + 2);
end $function$;

notify pgrst, 'reload schema';
