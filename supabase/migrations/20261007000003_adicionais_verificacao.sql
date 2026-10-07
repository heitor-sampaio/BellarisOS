-- O que a verificação independente achou nos adicionais do plano (2026-10-07).

-- 1. A escrita de adicional, de novo:
--    - a OFERTA é a do plano no CATÁLOGO (platform_plans), não a do retrato:
--      oferecer um adicional num plano vale para quem já o assina; o retrato
--      segue valendo para funcionalidades e limites;
--    - preço dado pelo sistema diferente da oferta é ESPECIAL (cortesia,
--      desconto) e fica marcado: a clínica cancela, mas não aumenta a
--      quantidade de uma condição especial — senão a cortesia de uma conexão
--      virava dez de graça;
--    - com a cobrança ligada, a mensalidade não zera por um adicional (o Asaas
--      não aceita R$ 0, e a cobrança antiga seguiria rodando).
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
      -- não se estende a quem compra sozinho.
      v_valor := (v_atual ->> 'valor_centavos')::int;
      v_especial := coalesce((v_atual ->> 'especial')::boolean, false);
      if v_especial and p_quantidade > coalesce((v_atual ->> 'quantidade')::int, 0) then
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

  update public.tenant_subscriptions set adicionais = v_depois, updated_at = now()
   where tenant_id = p_tenant
  returning * into v_sub;

  if v_sub.cobranca = 'ativa' and v_sub.valor_total_centavos <= 0 then
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

-- 2. Trocar de plano (ou de retrato) tira, NO MESMO COMANDO, o adicional que o
--    novo já inclui. Antes o app lia a lista, filtrava e regravava inteira: um
--    adicional contratado pela clínica no meio sumia sem aviso. O gatilho
--    roda na mesma linha travada que a função de escrita usa.
create or replace function private.retrato_sem_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is null or new.recursos is null then
    -- Sem plano, sem retrato; sem retrato, tudo liberado — e nada a vender à parte.
    if new.plan_id is null then new.recursos := null; end if;
    new.adicionais := '{}'::jsonb;
  else
    if (new.recursos -> 'limites' ->> 'whatsapp') is null then new.adicionais := new.adicionais - 'whatsapp'; end if;
    if coalesce((new.recursos -> 'funcionalidades') ? 'copilot', false) then new.adicionais := new.adicionais - 'copilot'; end if;
  end if;
  return new;
end $$;

-- 3. Só o Copilot é funcionalidade vendida à parte (o WhatsApp extra é limite):
--    igual a recursosEfetivos, sem abrir chave nova por acaso.
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
         or (p_chave = 'copilot' and coalesce((s.adicionais -> 'copilot' ->> 'quantidade')::int, 0) > 0)
       from public.tenant_subscriptions s where s.tenant_id = p_tenant),
    true)
$$;
revoke execute on function private.rede_tem_recurso(uuid, text) from public, anon, authenticated;
grant execute on function private.rede_tem_recurso(uuid, text) to service_role;

-- 4. O limite de WhatsApp diz o caminho que agora existe: a clínica contrata
--    a conexão adicional sozinha (igual a mensagemDoLimite, lib/planos/limites.ts).
do $$
declare
  v_antes text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('private.limite_do_plano()'::regprocedure);
  v_depois := replace(v_antes,
    $x$      message = format('O plano da sua rede permite até %s %s. Para ampliar, fale com o BellarisOS.',
                       v_limite, case when v_limite = 1 then v_um else v_varios end),$x$,
    $x$      message = format('O plano da sua rede permite até %s %s. Para ampliar, %s',
                       v_limite, case when v_limite = 1 then v_um else v_varios end,
                       case when v_chave = 'whatsapp'
                         then 'contrate uma conexão adicional em Configurações → Assinatura ou fale com o BellarisOS.'
                         else 'fale com o BellarisOS.' end),$x$);
  if v_depois = v_antes then raise exception 'limite_do_plano: o trecho de referência mudou'; end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
