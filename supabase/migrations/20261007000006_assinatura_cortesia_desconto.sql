-- CORTESIA e DESCONTO na assinatura da rede (2026-10-07, decisões do Heitor):
-- por item (o plano, as conexões de WhatsApp, o Copilot), em percentual ou em
-- reais, ou de graça, com data de fim opcional. A conta é a de
-- packages/nucleo/src/lib/planos/condicoes.ts — o E2E compara as duas.

-- 1. As condições e a conta de cada item.
alter table public.tenant_subscriptions
  add column if not exists condicoes jsonb not null default '{}'::jsonb;

create or replace function private.valor_com_condicao(p_bruto int, p_c jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_c is null or jsonb_typeof(p_c) <> 'object' then p_bruto
    when p_c ->> 'tipo' = 'cortesia' then 0
    when p_c ->> 'tipo' = 'percentual' then p_bruto - round(p_bruto * (p_c ->> 'percentual')::numeric / 100)::int
    when p_c ->> 'tipo' = 'valor' then greatest(0, p_bruto - (p_c ->> 'centavos')::int)
    else p_bruto
  end
$$;

-- 2. A mensalidade é o LÍQUIDO (o que o Asaas cobra). Deixa de ser coluna
--    gerada — a conta passa por uma função, e coluna gerada não pode depender
--    de função que muda — e vira coluna mantida por gatilho. O gatilho roda
--    DEPOIS de trg_retrato_sem_plano (ordem alfabética), que tira o que não
--    cabe no plano.
alter table public.tenant_subscriptions drop column if exists valor_total_centavos;
alter table public.tenant_subscriptions add column valor_total_centavos integer not null default 0;

create or replace function private.total_da_assinatura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.valor_total_centavos :=
      private.valor_com_condicao(new.valor_centavos, new.condicoes -> 'plano')
    + private.valor_com_condicao(coalesce((new.adicionais -> 'whatsapp' ->> 'quantidade')::int * (new.adicionais -> 'whatsapp' ->> 'valor_centavos')::int, 0), new.condicoes -> 'whatsapp')
    + private.valor_com_condicao(coalesce((new.adicionais -> 'copilot'  ->> 'quantidade')::int * (new.adicionais -> 'copilot'  ->> 'valor_centavos')::int, 0), new.condicoes -> 'copilot');
  return new;
end $$;

drop trigger if exists trg_total_da_assinatura on public.tenant_subscriptions;
create trigger trg_total_da_assinatura before insert or update on public.tenant_subscriptions
  for each row execute function private.total_da_assinatura();

-- Recalcula o que existe (o update dispara o gatilho).
update public.tenant_subscriptions set condicoes = condicoes;

-- 3. Sem plano, sem condições; o adicional que sai leva a condição dele.
create or replace function private.retrato_sem_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is null or new.recursos is null then
    -- Sem plano, sem retrato; sem retrato, tudo liberado — e nada a vender à parte.
    if new.plan_id is null then
      new.recursos := null;
      new.condicoes := '{}'::jsonb;
    end if;
    new.adicionais := '{}'::jsonb;
    new.condicoes := new.condicoes - 'whatsapp' - 'copilot';
  else
    if (new.recursos -> 'limites' ->> 'whatsapp') is null then
      new.adicionais := new.adicionais - 'whatsapp';
      new.condicoes := new.condicoes - 'whatsapp';
    end if;
    if coalesce((new.recursos -> 'funcionalidades') ? 'copilot', false) then
      new.adicionais := new.adicionais - 'copilot';
      new.condicoes := new.condicoes - 'copilot';
    end if;
  end if;
  return new;
end $$;

-- 4. A escrita de adicional, de novo (a da 20261007000003, mais):
--    - tirar o adicional tira a condição dele;
--    - item com condição é condição especial: a clínica (sem preço) não aumenta;
--    - a mensalidade zerada com a cobrança ligada só é aceita na cortesia do plano
--      (aí o sistema encerra a cobrança no Asaas).
create or replace function public.assinatura_adicional_definir(
  p_tenant uuid, p_chave text, p_quantidade int, p_valor_centavos int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub      public.tenant_subscriptions%rowtype;
  v_rotulo   text;
  v_max      int;
  v_antes    jsonb;
  v_depois   jsonb;
  v_atual    jsonb;
  v_oferta   jsonb;
  v_ofertado int;
  v_valor    int;
  v_especial boolean;
  v_limite   int;
  v_ativos   int;
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

  select p.recursos -> 'adicionais' -> p_chave -> 'valor_centavos' into v_oferta
    from public.platform_plans p where p.id = v_sub.plan_id;
  v_ofertado := case when jsonb_typeof(v_oferta) = 'number' then (v_oferta #>> '{}')::int end;

  v_antes := v_sub.adicionais;
  v_atual := v_antes -> p_chave;
  if p_quantidade = 0 then
    v_depois := v_antes - p_chave;
  else
    if p_valor_centavos is not null then
      -- O sistema dá o preço (o da oferta, ou um especial).
      if p_valor_centavos < 0 or p_valor_centavos > 10000000 then
        raise exception using errcode = 'P0001', message = format('%s: preço inválido.', v_rotulo);
      end if;
      v_valor := p_valor_centavos;
      v_especial := v_ofertado is distinct from p_valor_centavos;
    elsif v_atual is not null then
      -- O preço RETRATADO: mudar a quantidade não reajusta. Condição especial
      -- (preço do sistema, cortesia, desconto) não se estende a quem compra sozinho.
      v_valor := (v_atual ->> 'valor_centavos')::int;
      v_especial := coalesce((v_atual ->> 'especial')::boolean, false);
      if (v_especial or v_sub.condicoes ? p_chave) and p_quantidade > coalesce((v_atual ->> 'quantidade')::int, 0) then
        raise exception using errcode = 'P0001', message =
          'Este adicional tem uma condição especial combinada com o BellarisOS. Para aumentar, fale com o BellarisOS pela Ajuda.';
      end if;
    else
      if v_ofertado is null then
        raise exception using errcode = 'P0001', message = format('O plano da rede não oferece: %s.', v_rotulo);
      end if;
      v_valor := v_ofertado;
      v_especial := false;
    end if;
    v_depois := v_antes || jsonb_build_object(p_chave,
      jsonb_build_object('quantidade', p_quantidade, 'valor_centavos', v_valor)
      || case when v_especial then '{"especial": true}'::jsonb else '{}'::jsonb end);
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

  update public.tenant_subscriptions
     set adicionais = v_depois,
         condicoes = case when p_quantidade = 0 then condicoes - p_chave else condicoes end,
         updated_at = now()
   where tenant_id = p_tenant
  returning * into v_sub;

  if v_sub.cobranca = 'ativa' and v_sub.valor_total_centavos <= 0
     and coalesce(v_sub.condicoes -> 'plano' ->> 'tipo', '') <> 'cortesia' then
    raise exception using errcode = 'P0001', message =
      'Com a cobrança ligada, a mensalidade ficaria em R$ 0,00. Para encerrar a assinatura, fale com o BellarisOS pela Ajuda.';
  end if;

  return jsonb_build_object(
    'antes', v_antes,
    'depois', v_depois,
    'total_centavos', v_sub.valor_total_centavos,
    'pendente_no_asaas', v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos);
end $$;

revoke execute on function public.assinatura_adicional_definir(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.assinatura_adicional_definir(uuid, text, int, int) to service_role;

-- 5. Dar, mudar ou tirar a condição de um item — só o sistema (service role).
--    p_condicao null = preço normal. A rede toda de cortesia vai a ativa (sai do
--    teste ou do atraso): o "pago" dela é a cortesia.
create or replace function public.assinatura_condicao_definir(p_tenant uuid, p_item text, p_condicao jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub       public.tenant_subscriptions%rowtype;
  v_antes     jsonb;
  v_tipo      text;
  v_ate       text;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_de        text;
  v_para      text;
  v_cortesia  boolean;
begin
  if p_item not in ('plano', 'whatsapp', 'copilot') then
    raise exception using errcode = 'P0001', message = 'Item desconhecido.';
  end if;
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant for update;
  if not found or v_sub.plan_id is null then
    raise exception using errcode = 'P0001', message = 'A rede está sem plano: defina o plano antes de dar condição.';
  end if;
  if p_item <> 'plano' and not (v_sub.adicionais ? p_item) then
    raise exception using errcode = 'P0001', message = 'A rede não tem este adicional: contrate antes de dar condição.';
  end if;

  if p_condicao is not null then
    if jsonb_typeof(p_condicao) <> 'object' then
      raise exception using errcode = 'P0001', message = 'Condição inválida.';
    end if;
    v_tipo := p_condicao ->> 'tipo';
    v_ate := nullif(p_condicao ->> 'ate', '');
    if v_ate is not null then
      if v_ate !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception using errcode = 'P0001', message = 'Data de fim inválida.';
      end if;
      if v_ate::date < v_hoje then
        raise exception using errcode = 'P0001', message = 'A data de fim já passou.';
      end if;
    end if;
    if v_tipo = 'percentual' then
      if jsonb_typeof(p_condicao -> 'percentual') <> 'number'
         or (p_condicao ->> 'percentual')::numeric not between 1 and 100
         or (p_condicao ->> 'percentual')::numeric <> trunc((p_condicao ->> 'percentual')::numeric) then
        raise exception using errcode = 'P0001', message = 'Desconto de 1% a 100%.';
      end if;
      p_condicao := jsonb_build_object('tipo', 'percentual', 'percentual', (p_condicao ->> 'percentual')::int);
    elsif v_tipo = 'valor' then
      if jsonb_typeof(p_condicao -> 'centavos') <> 'number'
         or (p_condicao ->> 'centavos')::numeric not between 1 and 10000000
         or (p_condicao ->> 'centavos')::numeric <> trunc((p_condicao ->> 'centavos')::numeric) then
        raise exception using errcode = 'P0001', message = 'Desconto em reais inválido.';
      end if;
      p_condicao := jsonb_build_object('tipo', 'valor', 'centavos', (p_condicao ->> 'centavos')::int);
    elsif v_tipo = 'cortesia' then
      p_condicao := jsonb_build_object('tipo', 'cortesia');
    else
      raise exception using errcode = 'P0001', message = 'Condição inválida.';
    end if;
    if v_ate is not null then p_condicao := p_condicao || jsonb_build_object('ate', v_ate); end if;
  end if;

  v_antes := v_sub.condicoes;
  update public.tenant_subscriptions
     set condicoes = case when p_condicao is null then condicoes - p_item else condicoes || jsonb_build_object(p_item, p_condicao) end,
         updated_at = now()
   where tenant_id = p_tenant
  returning * into v_sub;

  v_cortesia := coalesce(v_sub.condicoes -> 'plano' ->> 'tipo', '') = 'cortesia' and v_sub.valor_total_centavos = 0;
  if v_cortesia then
    select plan_status into v_de from public.tenants where id = p_tenant;
    if v_de in ('trial', 'past_due', 'suspended') then
      update public.tenants set plan_status = 'active', em_atraso_desde = null, updated_at = now() where id = p_tenant;
      v_para := 'active';
    end if;
  end if;

  return jsonb_build_object(
    'antes', v_antes,
    'depois', v_sub.condicoes,
    'total_centavos', v_sub.valor_total_centavos,
    'cortesia_total', v_cortesia,
    'situacao_antes', v_de,
    'situacao_depois', v_para,
    'pendente_no_asaas', v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos);
end $$;

revoke execute on function public.assinatura_condicao_definir(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.assinatura_condicao_definir(uuid, text, jsonb) to service_role;

-- 6. As condições que terminaram ANTES de hoje saem (o cron do sistema, de
--    hora em hora). Reivindica pela própria linha: duas passagens não tiram
--    duas vezes. p_tenant é para o teste.
create or replace function public.assinaturas_encerrar_condicoes_vencidas(p_tenant uuid default null)
returns table(tenant_id uuid, itens text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return query
  with alvo as (
    select s.tenant_id,
           array(select k from jsonb_each(s.condicoes) e(k, v)
                  where (v ->> 'ate') ~ '^\d{4}-\d{2}-\d{2}$' and (v ->> 'ate')::date < v_hoje order by k) as vencidos
      from public.tenant_subscriptions s
     where (p_tenant is null or s.tenant_id = p_tenant)
       and exists (select 1 from jsonb_each(s.condicoes) e(k, v)
                    where (v ->> 'ate') ~ '^\d{4}-\d{2}-\d{2}$' and (v ->> 'ate')::date < v_hoje)
     for update
  ), u as (
    update public.tenant_subscriptions s
       set condicoes = s.condicoes - a.vencidos, updated_at = now()
      from alvo a
     where s.tenant_id = a.tenant_id
    returning s.tenant_id, a.vencidos
  ) select u.tenant_id, u.vencidos from u;
end $$;

revoke execute on function public.assinaturas_encerrar_condicoes_vencidas(uuid) from public, anon, authenticated;
grant execute on function public.assinaturas_encerrar_condicoes_vencidas(uuid) to service_role;

-- 7. A regra de atraso não move a rede toda de cortesia (mesmo que alguém a
--    ponha em teste de novo).
do $$
declare
  v_antes text;
  v_depois text;
  v_guarda text := $g$
      and not exists (select 1 from public.tenant_subscriptions sc
                       where sc.tenant_id = t.id and sc.condicoes -> 'plano' ->> 'tipo' = 'cortesia' and sc.valor_total_centavos = 0)$g$;
begin
  v_antes := pg_get_functiondef('public.assinaturas_aplicar_regras(timestamp with time zone, uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$    where t.plan_status = 'trial' and t.trial_ends_at is not null and t.trial_ends_at < p_agora
      and (p_tenant is null or t.id = p_tenant)$x$,
    $x$    where t.plan_status = 'trial' and t.trial_ends_at is not null and t.trial_ends_at < p_agora
      and (p_tenant is null or t.id = p_tenant)$x$ || v_guarda);
  v_depois := replace(v_depois,
    $x$    where t.plan_status = 'past_due' and t.em_atraso_desde is not null
      and t.em_atraso_desde + coalesce(v_carencia, 7) < (p_agora at time zone 'America/Sao_Paulo')::date
      and (p_tenant is null or t.id = p_tenant)$x$,
    $x$    where t.plan_status = 'past_due' and t.em_atraso_desde is not null
      and t.em_atraso_desde + coalesce(v_carencia, 7) < (p_agora at time zone 'America/Sao_Paulo')::date
      and (p_tenant is null or t.id = p_tenant)$x$ || v_guarda);
  if (length(v_depois) - length(v_antes)) <> 2 * length(v_guarda) then
    raise exception 'assinaturas_aplicar_regras: o trecho de referência mudou';
  end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
