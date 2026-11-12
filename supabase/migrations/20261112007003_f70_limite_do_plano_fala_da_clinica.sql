-- F70 — C61 do levantamento das regras (2026-11-12): a recusa do limite do
-- plano na fala da clínica.
--
-- A clínica de UMA unidade ativa não fala "rede" (D-19, `falaDaRede` no app):
-- o gatilho dizia "O plano da sua rede permite…" a quem só tem uma clínica.
-- Agora diz "clínica" com uma unidade ativa, e "rede" com duas ou mais — a
-- mesma régua de `mensagemDoLimite` (packages/nucleo/src/lib/planos/limites.ts).
-- O resto do corpo é o de 20261007000001 (com o caminho do WhatsApp de
-- 20261007000003), sem mudança.

create or replace function private.limite_do_plano()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chave    text;
  v_limite   int;
  v_ativos   int;
  v_um       text;
  v_varios   text;
  v_unidades int;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;

  v_chave := case tg_table_name when 'branches' then 'unidades' when 'users' then 'membros' else 'whatsapp' end;
  -- Uma por rede e por limite: a segunda transação espera a primeira e conta
  -- o que ela gravou.
  perform pg_advisory_xact_lock(hashtext('limite:' || new.tenant_id::text || ':' || v_chave));
  select (s.recursos -> 'limites' ->> v_chave)::int + coalesce((s.adicionais -> v_chave ->> 'quantidade')::int, 0)
    into v_limite
    from public.tenant_subscriptions s where s.tenant_id = new.tenant_id;
  if v_limite is null then return new; end if;

  execute format('select count(*) from public.%I where tenant_id = $1 and is_active and id <> $2', tg_table_name)
    into v_ativos using new.tenant_id, new.id;

  if v_ativos + 1 > v_limite then
    v_um     := case v_chave when 'unidades' then 'unidade' when 'membros' then 'membro na equipe' else 'número de WhatsApp' end;
    v_varios := case v_chave when 'unidades' then 'unidades' when 'membros' then 'membros na equipe' else 'números de WhatsApp' end;
    -- As unidades ATIVAS de agora (a que está entrando ainda não conta).
    select count(*) into v_unidades from public.branches b
     where b.tenant_id = new.tenant_id and b.is_active
       and (tg_table_name <> 'branches' or b.id <> new.id);
    raise exception using
      errcode = 'P0001',
      message = format('O plano da sua %s permite até %s %s. Para ampliar, %s',
                       case when v_unidades = 1 then 'clínica' else 'rede' end,
                       v_limite, case when v_limite = 1 then v_um else v_varios end,
                       case when v_chave = 'whatsapp'
                         then 'contrate uma conexão adicional em Configurações → Assinatura ou fale com o BellarisOS.'
                         else 'fale com o BellarisOS.' end),
      hint    = 'BELLARIS_LIMITE_DO_PLANO';
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';
