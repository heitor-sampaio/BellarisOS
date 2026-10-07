-- O que a verificação independente achou na cortesia e no desconto (2026-10-07).
--
-- "Rede de cortesia" passa a ser: TEM PLANO e NADA A PAGAR — por cortesia, por
-- 100% de desconto, por desconto em reais do tamanho do preço, ou por preço
-- zero. Antes só contava o tipo "cortesia" no plano: com 100% de desconto a
-- rede zerava, não virava cortesia, e acabava suspensa no fim do teste.
--
-- A cobrança ganha o estado 'cortesia' (pausa, não cancelamento): a cobrança
-- no Asaas é encerrada enquanto nada se cobra e VOLTA sozinha quando a rede
-- volta a ter valor (o sistema religa: lib/redes/cobranca.ts). Antes ia a
-- 'cancelada', e o fim da cortesia deixava a rede ativa, sem cobrança, para
-- sempre — e ainda entrava em "canceladas no mês".

-- 1. O estado novo da cobrança.
alter table public.tenant_subscriptions drop constraint if exists tenant_subscriptions_cobranca_check;
alter table public.tenant_subscriptions add constraint tenant_subscriptions_cobranca_check
  check (cobranca in ('sem_cobranca', 'ativa', 'cancelada', 'cortesia'));

-- 2. O mínimo que o Asaas cobra (R$ 5,00): a mensalidade é zero ou pelo menos
--    isso. Abaixo, o Asaas recusaria e seguiria cobrando o valor ANTIGO. No
--    gatilho do total, vale para todo caminho (condição, adicional, valor do plano).
create or replace function private.total_da_assinatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.valor_total_centavos :=
      private.valor_com_condicao(new.valor_centavos, new.condicoes -> 'plano')
    + private.valor_com_condicao(coalesce((new.adicionais -> 'whatsapp' ->> 'quantidade')::int * (new.adicionais -> 'whatsapp' ->> 'valor_centavos')::int, 0), new.condicoes -> 'whatsapp')
    + private.valor_com_condicao(coalesce((new.adicionais -> 'copilot'  ->> 'quantidade')::int * (new.adicionais -> 'copilot'  ->> 'valor_centavos')::int, 0), new.condicoes -> 'copilot');
  if new.valor_total_centavos between 1 and 499 then
    raise exception using errcode = 'P0001', message = format(
      'A mensalidade ficaria em R$ %s, abaixo do mínimo de R$ 5,00 que o Asaas cobra. Use cortesia (R$ 0,00) ou um desconto menor.',
      replace(to_char(new.valor_total_centavos / 100.0, 'FM0D00'), '.', ','));
  end if;
  return new;
end $$;

-- 3. A condição do PLANO não passa para outro plano (cortesia no Básico não
--    deixa o Pro de graça). As dos adicionais ficam, se o adicional fica.
create or replace function private.retrato_sem_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.plan_id is distinct from old.plan_id then
    new.condicoes := new.condicoes - 'plano';
  end if;
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

-- 4. A rede de cortesia, venha de onde vier (condição, adicional, troca de
--    plano, valor zero): ativa, sem atraso — o atraso de antes é perdoado,
--    como no "marcar em dia" —, e a cobrança 'cortesia' quando não havia
--    cobrança ligada (com cobrança ligada, quem pausa é o sistema, que fala com
--    o Asaas). Sem plano, a pausa de cortesia volta a "sem cobrança".
create or replace function private.cortesia_pela_mensalidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.plan_id is not null and new.valor_total_centavos = 0 then
    update public.tenants
       set plan_status = 'active', em_atraso_desde = null, atraso_perdoado_ate = v_hoje, updated_at = now()
     where id = new.tenant_id and plan_status in ('trial', 'past_due', 'suspended');
    if new.cobranca = 'sem_cobranca' then
      update public.tenant_subscriptions set cobranca = 'cortesia' where tenant_id = new.tenant_id and cobranca = 'sem_cobranca';
    end if;
  elsif new.plan_id is null and new.cobranca = 'cortesia' then
    update public.tenant_subscriptions set cobranca = 'sem_cobranca' where tenant_id = new.tenant_id and cobranca = 'cortesia';
  end if;
  return null;
end $$;

drop trigger if exists trg_cortesia_pela_mensalidade on public.tenant_subscriptions;
create trigger trg_cortesia_pela_mensalidade after insert or update on public.tenant_subscriptions
  for each row execute function private.cortesia_pela_mensalidade();

-- 5. As funções de escrita: o efeito do gatilho de depois (a situação, a
--    cobrança 'cortesia') entra no retorno; a "pendência no Asaas" inclui a
--    pausa de cortesia que voltou a ter valor (o sistema religa); e sai a trava
--    do total zero da escrita de adicional (zero agora é cortesia).
do $$
declare
  v_antes text;
  v_depois text;
  v_pendente_velho text := $x$'pendente_no_asaas', v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos)$x$;
  v_pendente_novo text := $x$'pendente_no_asaas', (v_sub.cobranca = 'ativa' and v_sub.valor_no_asaas_centavos is distinct from v_sub.valor_total_centavos)
                        or (v_sub.cobranca = 'cortesia' and v_sub.valor_total_centavos > 0))$x$;
begin
  -- assinatura_adicional_definir
  v_antes := pg_get_functiondef('public.assinatura_adicional_definir(uuid,text,int,int)'::regprocedure);
  v_depois := replace(v_antes,
    $x$  if v_sub.cobranca = 'ativa' and v_sub.valor_total_centavos <= 0
     and coalesce(v_sub.condicoes -> 'plano' ->> 'tipo', '') <> 'cortesia' then
    raise exception using errcode = 'P0001', message =
      'Com a cobrança ligada, a mensalidade ficaria em R$ 0,00. Para encerrar a assinatura, fale com o BellarisOS pela Ajuda.';
  end if;$x$,
    $x$  -- O gatilho de depois (a rede de cortesia) pode ter mudado a linha.
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant;$x$);
  v_depois := replace(v_depois, v_pendente_velho, v_pendente_novo);
  if v_depois = v_antes or position('R$ 0,00. Para encerrar' in v_depois) > 0 or position('v_sub.cobranca = ''cortesia''' in v_depois) = 0 then
    raise exception 'assinatura_adicional_definir: o trecho de referência mudou';
  end if;
  execute v_depois;

  -- assinatura_condicao_definir: a situação passa a ser do gatilho; aqui só se lê.
  v_antes := pg_get_functiondef('public.assinatura_condicao_definir(uuid,text,jsonb)'::regprocedure);
  v_depois := replace(v_antes,
    $x$  v_antes := v_sub.condicoes;
  update public.tenant_subscriptions$x$,
    $x$  v_antes := v_sub.condicoes;
  select plan_status into v_de from public.tenants where id = p_tenant;
  update public.tenant_subscriptions$x$);
  v_depois := replace(v_depois,
    $x$  v_cortesia := coalesce(v_sub.condicoes -> 'plano' ->> 'tipo', '') = 'cortesia' and v_sub.valor_total_centavos = 0;
  if v_cortesia then
    select plan_status into v_de from public.tenants where id = p_tenant;
    if v_de in ('trial', 'past_due', 'suspended') then
      update public.tenants set plan_status = 'active', em_atraso_desde = null, updated_at = now() where id = p_tenant;
      v_para := 'active';
    end if;
  end if;$x$,
    $x$  -- O gatilho de depois (a rede de cortesia) pode ter mudado a linha e a situação.
  select * into v_sub from public.tenant_subscriptions where tenant_id = p_tenant;
  v_cortesia := v_sub.valor_total_centavos = 0;
  select plan_status into v_para from public.tenants where id = p_tenant;
  if v_para is not distinct from v_de then v_para := null; end if;$x$);
  v_depois := replace(v_depois, v_pendente_velho, v_pendente_novo);
  if v_depois = v_antes or position('v_cortesia := v_sub.valor_total_centavos = 0' in v_depois) = 0
     or position('v_sub.cobranca = ''cortesia''' in v_depois) = 0 then
    raise exception 'assinatura_condicao_definir: o trecho de referência mudou';
  end if;
  execute v_depois;

  -- assinaturas_aplicar_regras: a guarda é "tem plano e nada a pagar".
  v_antes := pg_get_functiondef('public.assinaturas_aplicar_regras(timestamp with time zone, uuid)'::regprocedure);
  v_depois := replace(v_antes,
    $x$sc.condicoes -> 'plano' ->> 'tipo' = 'cortesia' and sc.valor_total_centavos = 0$x$,
    $x$sc.plan_id is not null and sc.valor_total_centavos = 0$x$);
  if (length(v_antes) - length(v_depois)) = 0 then
    raise exception 'assinaturas_aplicar_regras: o trecho de referência mudou';
  end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
