-- Os ADICIONAIS do plano (2026-10-07, decisão do Heitor): conexões de WhatsApp
-- além do limite e o Copilot avulso, somados à mensalidade. O plano OFERECE
-- (recursos.adicionais, com o preço); a rede CONTRATA (adicionais, com o preço
-- retratado). Catálogo em packages/nucleo/src/lib/planos/recursos.ts e
-- adicionais.ts — chave nova lá exige migration aqui.

-- 1. O contratado, o total e o que o Asaas já recebeu.
alter table public.tenant_subscriptions
  add column if not exists adicionais jsonb not null default '{}'::jsonb,
  -- O valor que foi levado ao Asaas por último. Diferente do total = pendente
  -- (o cron do sistema reconcilia).
  add column if not exists valor_no_asaas_centavos integer;

alter table public.tenant_subscriptions
  add column if not exists valor_total_centavos integer generated always as (
    valor_centavos
    + coalesce((adicionais -> 'whatsapp' ->> 'quantidade')::int * (adicionais -> 'whatsapp' ->> 'valor_centavos')::int, 0)
    + coalesce((adicionais -> 'copilot'  ->> 'quantidade')::int * (adicionais -> 'copilot'  ->> 'valor_centavos')::int, 0)
  ) stored;

-- A cobrança já ligada recebeu o valor da época (não havia adicional).
update public.tenant_subscriptions set valor_no_asaas_centavos = valor_centavos
 where cobranca = 'ativa' and asaas_subscription_id is not null and valor_no_asaas_centavos is null;

-- 2. Sem plano, sem retrato — e sem adicional (adicional só existe sobre um plano).
create or replace function private.retrato_sem_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is null then
    new.recursos := null;
    new.adicionais := '{}'::jsonb;
  end if;
  return new;
end $$;

-- 3. A funcionalidade CONTRATADA avulsa conta (o Copilot).
create or replace function private.rede_tem_recurso(p_tenant uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.recursos is null
         or coalesce((s.recursos -> 'funcionalidades') ? p_chave, false)
         or coalesce((s.adicionais -> p_chave ->> 'quantidade')::int, 0) > 0
       from public.tenant_subscriptions s where s.tenant_id = p_tenant),
    true)
$$;
revoke execute on function private.rede_tem_recurso(uuid, text) from public, anon, authenticated;
grant execute on function private.rede_tem_recurso(uuid, text) to service_role;

-- 4. O limite conta a conexão extra. E a trava vem ANTES de ler o limite: lido
--    antes, uma redução concorrente (tirar a conexão extra) passava com o
--    limite velho.
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
    raise exception using
      errcode = 'P0001',
      message = format('O plano da sua rede permite até %s %s. Para ampliar, fale com o BellarisOS.',
                       v_limite, case when v_limite = 1 then v_um else v_varios end),
      hint    = 'BELLARIS_LIMITE_DO_PLANO';
  end if;
  return new;
end $$;

-- 5. Contratar, mudar a quantidade ou tirar um adicional — a ÚNICA porta de
--    escrita, para a clínica e para o sistema (ambos pelo servidor).
--    p_valor_centavos: preço especial (o sistema); null = mantém o contratado,
--    ou o preço que o plano oferece.
create or replace function public.assinatura_adicional_definir(
  p_tenant uuid, p_chave text, p_quantidade int, p_valor_centavos int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub     public.tenant_subscriptions%rowtype;
  v_rotulo  text;
  v_max     int;
  v_antes   jsonb;
  v_depois  jsonb;
  v_oferta  jsonb;
  v_valor   int;
  v_limite  int;
  v_ativos  int;
begin
  v_rotulo := case p_chave when 'whatsapp' then 'Conexão de WhatsApp adicional' when 'copilot' then 'Copilot avulso' end;
  if v_rotulo is null then
    raise exception using errcode = 'P0001', message = 'Adicional desconhecido.';
  end if;
  v_max := case p_chave when 'whatsapp' then 10 else 1 end;
  if p_quantidade is null or p_quantidade < 0 or p_quantidade > v_max then
    raise exception using errcode = 'P0001', message = format('%s: de 0 até %s.', v_rotulo, v_max);
  end if;

  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant for update;
  if not found or v_sub.plan_id is null or v_sub.recursos is null then
    raise exception using errcode = 'P0001', message = 'A rede está sem plano: adicional só existe sobre um plano.';
  end if;
  if p_chave = 'whatsapp' and (v_sub.recursos -> 'limites' ->> 'whatsapp') is null then
    raise exception using errcode = 'P0001', message = 'O plano da rede tem WhatsApp ilimitado: não há conexão adicional.';
  end if;
  if p_chave = 'copilot' and coalesce((v_sub.recursos -> 'funcionalidades') ? 'copilot', false) then
    raise exception using errcode = 'P0001', message = 'O plano da rede já inclui o Copilot.';
  end if;

  v_antes := v_sub.adicionais;
  if p_quantidade = 0 then
    v_depois := v_antes - p_chave;
  else
    if p_valor_centavos is not null then
      if p_valor_centavos < 0 or p_valor_centavos > 10000000 then
        raise exception using errcode = 'P0001', message = format('%s: preço inválido.', v_rotulo);
      end if;
      v_valor := p_valor_centavos;
    elsif v_antes ? p_chave then
      -- O preço RETRATADO: aumentar a quantidade não reajusta.
      v_valor := (v_antes -> p_chave ->> 'valor_centavos')::int;
    else
      v_oferta := v_sub.recursos -> 'adicionais' -> p_chave -> 'valor_centavos';
      if v_oferta is null or jsonb_typeof(v_oferta) <> 'number' then
        raise exception using errcode = 'P0001', message = format('O plano da rede não oferece: %s.', v_rotulo);
      end if;
      v_valor := (v_oferta #>> '{}')::int;
    end if;
    v_depois := v_antes || jsonb_build_object(p_chave, jsonb_build_object('quantidade', p_quantidade, 'valor_centavos', v_valor));
  end if;

  -- Tirar conexão: não fica com mais números ativos do que o novo limite. Sob a
  -- MESMA trava do gatilho do limite (ligar um número enquanto se tira).
  if p_chave = 'whatsapp' then
    perform pg_advisory_xact_lock(hashtext('limite:' || p_tenant::text || ':whatsapp'));
    v_limite := (v_sub.recursos -> 'limites' ->> 'whatsapp')::int + coalesce((v_depois -> 'whatsapp' ->> 'quantidade')::int, 0);
    select count(*) into v_ativos from public.whatsapp_numbers where tenant_id = p_tenant and is_active;
    if v_ativos > v_limite then
      raise exception using errcode = 'P0001', message = format(
        'A rede tem %s números de WhatsApp ativos e ficaria com até %s. Desative um número antes de tirar a conexão adicional.',
        v_ativos, v_limite);
    end if;
  end if;

  update public.tenant_subscriptions set adicionais = v_depois, updated_at = now()
   where tenant_id = p_tenant
  returning * into v_sub;

  return jsonb_build_object(
    'antes', v_antes,
    'depois', v_depois,
    'total_centavos', v_sub.valor_total_centavos,
    'pendente_no_asaas', v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos);
end $$;

revoke execute on function public.assinatura_adicional_definir(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.assinatura_adicional_definir(uuid, text, int, int) to service_role;

notify pgrst, 'reload schema';
