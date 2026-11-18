-- "Marque o ganho" sai do cron e vira MODELO desligado nas Automações
-- (auditoria das regras, 2026-11-18). As falas: r2-cfg-04 ("toda e qualquer
-- automação deve ser feita através dos módulos de automações") e o princípio 6
-- ("automação nasce como modelo desligado; a rede liga se quiser"). Até aqui o
-- cron `crm-lembretes` mandava o aviso a todas as redes, sem desligar.
--
-- O FATO: `lead.cliente_comprou` — a cliente ligada a uma oportunidade ABERTA
-- comprou (pacote, pré-pago ou plano aceito) depois de a oportunidade nascer.
-- É a régua de antes (`crm_lembretes_de_ganho`, A45 da 9ª; a sugestão do card,
-- A18 da 7ª). Sai de GATILHO no banco (origem 'banco', sem ator), como
-- `pagamento.*`: a compra nasce em vários lugares do código. O cron das
-- automações (`despacharFatosDoBanco`) o leva ao motor; só dispara para a rede
-- que ligou uma automação nele (o modelo "Marque o ganho" nasce rascunho).
-- Uma linha por oportunidade aberta e por compra (`chave`).

create or replace function private.lead_cliente_comprou(
  p_client uuid, p_branch uuid, p_em timestamptz, p_compra text, p_ref text
) returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant uuid;
  v_cliente text;
  r record;
begin
  if p_client is null or p_em is null then return; end if;
  select c.tenant_id, c.name into v_tenant, v_cliente from public.clients c where c.id = p_client;
  if v_tenant is null then return; end if;

  for r in
    select l.id, l.name, l.phone, l.source, l.owner_id,
           s.name as etapa, f.name as funil
      from public.leads l
      left join public.crm_stages s on s.id = l.crm_stage_id
      left join public.crm_funnels f on f.id = s.funnel_id
     where l.tenant_id = v_tenant
       and l.client_id = p_client
       and coalesce(s.outcome, 'OPEN') not in ('WON', 'LOST')
       and l.created_at <= p_em
  loop
    insert into public.domain_events
      (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
    values (
      v_tenant, p_branch, 'lead.cliente_comprou', 'lead', r.id,
      jsonb_build_object(
        'leadId', r.id,
        'nome', r.name,
        'telefone', r.phone,
        'clienteId', p_client,
        'clienteNome', v_cliente,
        'funilNome', r.funil,
        'etapaNome', r.etapa,
        'origemDoLead', r.source,
        'responsavelId', r.owner_id,
        'compra', p_compra,
        'compraEm', p_em),
      'sistema', 'banco', 'lead.cliente_comprou:' || r.id || ':' || p_ref)
    on conflict (tenant_id, chave) where chave is not null do nothing;
  end loop;
end;
$function$;

revoke execute on function private.lead_cliente_comprou(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;

-- Pacote: vendido (purchased_at) e não cancelado.
create or replace function private.lead_cliente_comprou_pacote()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.purchased_at is null or new.cancelado_em is not null then return new; end if;
  if tg_op = 'UPDATE' and old.purchased_at is not null then return new; end if;
  perform private.lead_cliente_comprou(
    new.client_id, new.branch_id, new.purchased_at,
    'Pacote ' || coalesce((select sp.name from public.service_packages sp where sp.id = new.package_id), ''),
    'pacote:' || new.id);
  return new;
end;
$function$;

drop trigger if exists trg_lead_cliente_comprou_pacote on public.client_packages;
create trigger trg_lead_cliente_comprou_pacote
  after insert or update of purchased_at on public.client_packages
  for each row execute function private.lead_cliente_comprou_pacote();

-- Pré-pago: vendido (sold_at).
create or replace function private.lead_cliente_comprou_pre_pago()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.sold_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.sold_at is not null then return new; end if;
  perform private.lead_cliente_comprou(
    new.client_id, new.branch_id, new.sold_at,
    coalesce((select p.name from public.procedures p where p.id = new.procedure_id), 'Procedimento') || ' (pré-pago)',
    'pre-pago:' || new.id);
  return new;
end;
$function$;

drop trigger if exists trg_lead_cliente_comprou_pre_pago on public.procedure_sales;
create trigger trg_lead_cliente_comprou_pre_pago
  after insert or update of sold_at on public.procedure_sales
  for each row execute function private.lead_cliente_comprou_pre_pago();

-- Plano: aceito (aceito_em) e não cancelado.
create or replace function private.lead_cliente_comprou_plano()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.aceito_em is null or new.status = 'CANCELLED' then return new; end if;
  if tg_op = 'UPDATE' and old.aceito_em is not null then return new; end if;
  perform private.lead_cliente_comprou(
    new.client_id, new.branch_id, new.aceito_em,
    case when nullif(trim(new.name), '') is null then 'Plano de tratamento'
         when new.name ilike 'plano%' then trim(new.name) else 'Plano ' || trim(new.name) end,
    'plano:' || new.id);
  return new;
end;
$function$;

drop trigger if exists trg_lead_cliente_comprou_plano on public.treatment_plans;
create trigger trg_lead_cliente_comprou_plano
  after insert or update of aceito_em on public.treatment_plans
  for each row execute function private.lead_cliente_comprou_plano();

-- O cron não lembra mais: a régua de antes sai. A coluna `ganho_lembrado_em`
-- fica (dado gravado; nada mais a escreve).
drop function if exists public.crm_lembretes_de_ganho(integer);

comment on column public.leads.ganho_lembrado_em is
  'A45 (9ª simulação): quando o cron lembrou o ganho. Desde 2026-11-18 o aviso é o modelo "Marque o ganho" das Automações (o fato lead.cliente_comprou); nada mais grava aqui.';

notify pgrst, 'reload schema';
