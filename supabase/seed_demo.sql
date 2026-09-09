-- Seed de demonstração — números escolhidos para conferência manual.
--
-- Idempotente: tudo que ele cria usa UUIDs com o prefixo 'dddddddd', e o
-- script apaga esses registros antes de recriar. Não toca em nada fora disso.
--
-- Valores esperados no MÊS CORRENTE (America/Sao_Paulo), rede inteira:
--   Receita de serviço (competência) .. R$ 5.000,00   (20 atendimentos concluídos)
--     Centro ......................... R$ 2.000,00   (10 × R$ 200)
--     Jardins ........................ R$ 3.000,00   (10 × R$ 300)
--   Ticket médio ..................... R$   250,00   (5.000 ÷ 20)
--   Recebido (caixa) ................. R$ 4.600,00   (18 atendimentos pagos)
--   A receber ........................ R$   400,00   (2 atendimentos do Centro)
--   Despesas pagas ................... R$ 1.000,00   (Centro 600 + Jardins 400)
--   Resultado ........................ R$ 3.600,00
--   Comissões (10%) .................. R$   500,00
--   Agendamentos no período .......... 28  (20 concluídos, 3 cancelados,
--                                           2 no-show, 3 futuros agendados)
--   Taxa de conclusão ................ 20/28 = 71,4%
--   Novos clientes ................... 12
--   Leads ............................ 20, sendo 8 convertidos = 40%
--   Taxa de retenção ................. 25,0%  (3 dos 12 atendidos já eram
--                                              clientes antes do mês)
--
-- Fora da janela do mês, o seed cria 3 atendimentos no mês anterior (R$ 600)
-- só para a retenção ter um valor conferível diferente de zero.

do $seed$
declare
  v_tenant   uuid := '880e0566-d467-4fdd-a3a9-fed682ad1cc3';
  v_centro   uuid := '2aa146cd-5416-4351-912d-268524054212';
  v_jardins  uuid := 'dddddddd-0000-0000-0000-000000000002';
  v_role     uuid;
  v_proc_a   uuid := 'dddddddd-3000-0000-0000-000000000001';  -- R$ 200 / 60min
  v_proc_b   uuid := 'dddddddd-3000-0000-0000-000000000002';  -- R$ 300 / 90min
  v_stage    uuid;
  v_month    timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo')
                            at time zone 'America/Sao_Paulo';
  v_appt     uuid;
  v_rec      uuid;
  v_prof     uuid;
  v_client   uuid;
  i          int;
begin
  -- ── Limpeza do seed anterior ───────────────────────────────────────────────
  delete from public.commissions          where appointment_id::text like 'dddddddd%';
  delete from public.financial_transactions
         where appointment_id::text like 'dddddddd%' or id::text like 'dddddddd%';
  delete from public.medical_record_entries where appointment_id::text like 'dddddddd%';
  delete from public.medical_records       where client_id::text  like 'dddddddd%';
  delete from public.appointments          where id::text like 'dddddddd%';
  delete from public.commission_rules      where professional_id::text like 'dddddddd%';
  delete from public.leads                 where id::text like 'dddddddd%';
  delete from public.loyalty_accounts      where client_id::text like 'dddddddd%';
  delete from public.clients               where id::text like 'dddddddd%';
  delete from public.branch_product_stock  where product_id::text like 'dddddddd%';
  delete from public.products              where id::text like 'dddddddd%';
  delete from public.procedures            where id::text like 'dddddddd%';
  delete from public.rooms                 where id::text like 'dddddddd%';
  delete from public.users                 where id::text like 'dddddddd%';
  delete from public.branches              where id::text like 'dddddddd%';

  select id into v_role from public.tenant_roles
   where tenant_id = v_tenant and key = 'NETWORK_ADMIN' limit 1;

  -- ── 2ª filial (para exercitar a consolidação da rede) ──────────────────────
  insert into public.branches (id, tenant_id, name, slug, phone, city, state, is_active)
  values (v_jardins, v_tenant, 'Jardins', 'jardins', '11999990002', 'São Paulo', 'SP', true);

  -- ── Profissionais ─────────────────────────────────────────────────────────
  insert into public.users (id, tenant_id, branch_id, auth_id, name, email, is_active, provides_services, role_id)
  values
    ('dddddddd-1000-0000-0000-000000000001', v_tenant, v_centro,  'dddddddd-1000-0000-0000-00000000a001', 'Ana Prado',    'ana.demo@bellaris.com.br',    true, true, v_role),
    ('dddddddd-1000-0000-0000-000000000002', v_tenant, v_centro,  'dddddddd-1000-0000-0000-00000000a002', 'Bruna Ferraz', 'bruna.demo@bellaris.com.br',  true, true, v_role),
    ('dddddddd-1000-0000-0000-000000000003', v_tenant, v_jardins, 'dddddddd-1000-0000-0000-00000000a003', 'Carla Nunes',  'carla.demo@bellaris.com.br',  true, true, v_role);

  -- Comissão de 10% para todos, em ambas as filiais
  insert into public.commission_rules (branch_id, professional_id, procedure_id, type, value, is_active)
  select b.id, u.id, null, 'PERCENTAGE', 10, true
  from public.users u
  cross join (select v_centro as id union all select v_jardins) b
  where u.id::text like 'dddddddd%' and u.branch_id = b.id;

  -- ── Salas ─────────────────────────────────────────────────────────────────
  insert into public.rooms (id, branch_id, name, is_active) values
    ('dddddddd-5000-0000-0000-000000000001', v_centro,  'Cabine 1', true),
    ('dddddddd-5000-0000-0000-000000000002', v_jardins, 'Cabine 1', true);

  -- ── Procedimentos com preço redondo ───────────────────────────────────────
  insert into public.procedures (id, tenant_id, branch_id, name, category, duration_min, price, is_active)
  values
    (v_proc_a, v_tenant, null, 'Limpeza de pele (demo)', 'Facial',  60, 200, true),
    (v_proc_b, v_tenant, null, 'Preenchimento (demo)',   'Injetável', 90, 300, true);

  -- ── Clientes (12 novos no mês) ────────────────────────────────────────────
  for i in 1..12 loop
    v_client := ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid;
    insert into public.clients (id, tenant_id, branch_id, name, phone, email, is_active, created_at, tags)
    values (
      v_client, v_tenant,
      case when i <= 6 then v_centro else v_jardins end,
      'Cliente Demo ' || lpad(i::text, 2, '0'),
      '1198888' || lpad(i::text, 4, '0'),
      'cliente.demo' || lpad(i::text, 2, '0') || '@exemplo.com.br',
      true,
      v_month + ((i - 1) || ' days')::interval + interval '10 hours',
      array[case when i <= 6 then 'Unidade: Centro' else 'Unidade: Jardins' end]
    );
    insert into public.loyalty_accounts (client_id, balance) values (v_client, 0);
    insert into public.medical_records (id, client_id)
    values (('dddddddd-6000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid, v_client);
  end loop;

  -- ── Atendimentos concluídos: Centro 10 × R$ 200 ───────────────────────────
  for i in 1..10 loop
    v_appt   := ('dddddddd-7000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid;
    v_prof   := case when i % 2 = 0
                     then 'dddddddd-1000-0000-0000-000000000002'
                     else 'dddddddd-1000-0000-0000-000000000001' end::uuid;
    v_client := ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(((i - 1) % 6) + 1), 2, '0'))::uuid;

    insert into public.appointments
      (id, branch_id, client_id, procedure_id, professional_id, room_id, status, source,
       scheduled_at, duration_min, price, completed_at, started_at, client_rating, procedure_rating)
    values
      (v_appt, v_centro, v_client, v_proc_a, v_prof, 'dddddddd-5000-0000-0000-000000000001',
       'COMPLETED', 'INTERNAL',
       v_month + ((i - 1) || ' days')::interval + interval '14 hours',
       60, 200,
       v_month + ((i - 1) || ' days')::interval + interval '15 hours',
       v_month + ((i - 1) || ' days')::interval + interval '14 hours',
       5, 4);

    select id into v_rec from public.medical_records where client_id = v_client limit 1;
    insert into public.medical_record_entries (medical_record_id, appointment_id, professional_id, anamnesis_data)
    values (v_rec, v_appt, v_prof, '{}'::jsonb);

    -- 8 pagos, 2 em aberto (os dois últimos)
    insert into public.financial_transactions
      (branch_id, appointment_id, client_id, type, category, description, amount,
       payment_method, is_paid, paid_at, created_by, created_at)
    values
      (v_centro, v_appt, v_client, 'INCOME', 'Serviços', 'Atendimento concluído', 200,
       case when i <= 8 then 'PIX'::"PaymentMethod" else null end,
       i <= 8,
       case when i <= 8 then v_month + ((i - 1) || ' days')::interval + interval '15 hours' else null end,
       'seed-demo',
       v_month + ((i - 1) || ' days')::interval + interval '15 hours');

    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status)
    values (v_centro, v_prof, v_appt, 20, 'PERCENTAGE', 10,
            to_char(v_month at time zone 'America/Sao_Paulo', 'YYYY-MM'), 'OPEN');
  end loop;

  -- ── Atendimentos concluídos: Jardins 10 × R$ 300 (todos pagos) ────────────
  for i in 1..10 loop
    v_appt   := ('dddddddd-7100-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid;
    v_prof   := 'dddddddd-1000-0000-0000-000000000003';
    v_client := ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(((i - 1) % 6) + 7), 2, '0'))::uuid;

    insert into public.appointments
      (id, branch_id, client_id, procedure_id, professional_id, room_id, status, source,
       scheduled_at, duration_min, price, completed_at, started_at, client_rating, procedure_rating)
    values
      (v_appt, v_jardins, v_client, v_proc_b, v_prof, 'dddddddd-5000-0000-0000-000000000002',
       'COMPLETED', 'INTERNAL',
       v_month + ((i - 1) || ' days')::interval + interval '16 hours',
       90, 300,
       v_month + ((i - 1) || ' days')::interval + interval '17 hours 30 minutes',
       v_month + ((i - 1) || ' days')::interval + interval '16 hours',
       4, 5);

    select id into v_rec from public.medical_records where client_id = v_client limit 1;
    insert into public.medical_record_entries (medical_record_id, appointment_id, professional_id, anamnesis_data)
    values (v_rec, v_appt, v_prof, '{}'::jsonb);

    insert into public.financial_transactions
      (branch_id, appointment_id, client_id, type, category, description, amount,
       payment_method, is_paid, paid_at, created_by, created_at)
    values
      (v_jardins, v_appt, v_client, 'INCOME', 'Serviços', 'Atendimento concluído', 300,
       'CREDIT_CARD', true,
       v_month + ((i - 1) || ' days')::interval + interval '17 hours 30 minutes',
       'seed-demo',
       v_month + ((i - 1) || ' days')::interval + interval '17 hours 30 minutes');

    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status)
    values (v_jardins, v_prof, v_appt, 30, 'PERCENTAGE', 10,
            to_char(v_month at time zone 'America/Sao_Paulo', 'YYYY-MM'), 'OPEN');
  end loop;

  -- ── Cancelados (3) e no-show (2) — não podem entrar em receita ────────────
  insert into public.appointments
    (id, branch_id, client_id, procedure_id, professional_id, status, source,
     scheduled_at, duration_min, price, cancelled_at, cancellation_reason)
  values
    ('dddddddd-7200-0000-0000-000000000001', v_centro,  'dddddddd-2000-0000-0000-000000000001'::uuid, v_proc_a, 'dddddddd-1000-0000-0000-000000000001'::uuid, 'CANCELLED', 'INTERNAL', v_month + interval '2 days 11 hours', 60, 200, v_month + interval '1 day', 'Cliente remarcou'),
    ('dddddddd-7200-0000-0000-000000000002', v_centro,  'dddddddd-2000-0000-0000-000000000002'::uuid, v_proc_a, 'dddddddd-1000-0000-0000-000000000002'::uuid, 'CANCELLED', 'INTERNAL', v_month + interval '3 days 11 hours', 60, 200, v_month + interval '2 days', 'Imprevisto'),
    ('dddddddd-7200-0000-0000-000000000003', v_jardins, 'dddddddd-2000-0000-0000-000000000007'::uuid, v_proc_b, 'dddddddd-1000-0000-0000-000000000003'::uuid, 'CANCELLED', 'ONLINE',   v_month + interval '4 days 11 hours', 90, 300, v_month + interval '3 days', 'Cliente desistiu');

  insert into public.appointments
    (id, branch_id, client_id, procedure_id, professional_id, status, source,
     scheduled_at, duration_min, price)
  values
    ('dddddddd-7300-0000-0000-000000000001', v_centro,  'dddddddd-2000-0000-0000-000000000003'::uuid, v_proc_a, 'dddddddd-1000-0000-0000-000000000001'::uuid, 'NO_SHOW', 'INTERNAL', v_month + interval '5 days 11 hours', 60, 200),
    ('dddddddd-7300-0000-0000-000000000002', v_jardins, 'dddddddd-2000-0000-0000-000000000008'::uuid, v_proc_b, 'dddddddd-1000-0000-0000-000000000003'::uuid, 'NO_SHOW', 'ONLINE',   v_month + interval '6 days 11 hours', 90, 300);

  -- ── Agendados futuros (3, no Centro) ──────────────────────────────────────
  for i in 1..3 loop
    insert into public.appointments
      (id, branch_id, client_id, procedure_id, professional_id, status, source,
       scheduled_at, duration_min, price)
    values
      (('dddddddd-7400-0000-0000-00000000000' || i)::uuid, v_centro,
       ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
       v_proc_a, 'dddddddd-1000-0000-0000-000000000001'::uuid,
       'SCHEDULED', 'CLIENT_APP',
       v_month + interval '20 days' + (i || ' hours')::interval + interval '9 hours',
       60, 200);
  end loop;

  -- ── Despesas pagas: Centro 600, Jardins 400 ───────────────────────────────
  insert into public.financial_transactions
    (id, branch_id, type, category, description, amount, payment_method, is_paid, paid_at, created_by, created_at)
  values
    ('dddddddd-8000-0000-0000-000000000001', v_centro,  'EXPENSE', 'Aluguel',  'Aluguel da unidade',  400, 'PIX',  true, v_month + interval '4 days', 'seed-demo', v_month + interval '4 days'),
    ('dddddddd-8000-0000-0000-000000000002', v_centro,  'EXPENSE', 'Estoque',  'Compra de insumos',   200, 'PIX',  true, v_month + interval '5 days', 'seed-demo', v_month + interval '5 days'),
    ('dddddddd-8000-0000-0000-000000000003', v_jardins, 'EXPENSE', 'Aluguel',  'Aluguel da unidade',  300, 'PIX',  true, v_month + interval '4 days', 'seed-demo', v_month + interval '4 days'),
    ('dddddddd-8000-0000-0000-000000000004', v_jardins, 'EXPENSE', 'Marketing','Anúncios do mês',     100, 'PIX',  true, v_month + interval '6 days', 'seed-demo', v_month + interval '6 days');

  -- ── Produtos e estoque (valor em estoque: R$ 2.000 por filial) ────────────
  insert into public.products (id, tenant_id, branch_id, name, sku, category, unit, cost_price, is_active)
  values
    ('dddddddd-4000-0000-0000-000000000001', v_tenant, null, 'Ácido hialurônico (demo)', 'DEMO-001', 'Injetável', 'UN', 100, true),
    ('dddddddd-4000-0000-0000-000000000002', v_tenant, null, 'Gel de limpeza (demo)',    'DEMO-002', 'Facial',    'UN',  50, true);

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values
    ('dddddddd-4000-0000-0000-000000000001', v_centro,  15, 5),
    ('dddddddd-4000-0000-0000-000000000002', v_centro,  10, 4),
    ('dddddddd-4000-0000-0000-000000000001', v_jardins, 12, 5),
    ('dddddddd-4000-0000-0000-000000000002', v_jardins,  2, 4);  -- abaixo do mínimo

  -- ── Histórico do mês anterior: 3 clientes já atendidos antes ──────────────
  -- Faz a taxa de retenção ter valor conferível (3 dos 12 atendidos no mês já
  -- eram clientes = 25%). Sem histórico, retenção seria 0% e não daria para
  -- distinguir "métrica certa" de "métrica quebrada".
  for i in 1..3 loop
    insert into public.appointments
      (id, branch_id, client_id, procedure_id, professional_id, status, source,
       scheduled_at, duration_min, price, completed_at, started_at)
    values (
      ('dddddddd-7f00-0000-0000-00000000000' || i)::uuid,
      v_centro,
      ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
      v_proc_a, 'dddddddd-1000-0000-0000-000000000001'::uuid,
      'COMPLETED', 'INTERNAL',
      v_month - interval '10 days' + (i || ' hours')::interval,
      60, 200,
      v_month - interval '10 days' + (i || ' hours')::interval + interval '1 hour',
      v_month - interval '10 days' + (i || ' hours')::interval
    );

    insert into public.financial_transactions
      (branch_id, appointment_id, client_id, type, category, description, amount,
       payment_method, is_paid, paid_at, created_by, created_at)
    values (
      v_centro, ('dddddddd-7f00-0000-0000-00000000000' || i)::uuid,
      ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
      'INCOME', 'Serviços', 'Atendimento concluído', 200,
      'PIX', true, v_month - interval '10 days' + (i || ' hours')::interval + interval '1 hour',
      'seed-demo', v_month - interval '10 days' + (i || ' hours')::interval + interval '1 hour'
    );
  end loop;

  -- ── CRM: 20 leads no mês, 8 convertidos ───────────────────────────────────
  select id into v_stage from public.crm_stages
   where tenant_id = v_tenant order by position limit 1;

  if v_stage is null then
    insert into public.crm_stages (tenant_id, name, color, position)
    values (v_tenant, 'Novo contato', '#c34d6b', 1)
    returning id into v_stage;
    insert into public.crm_stages (tenant_id, name, color, position) values
      (v_tenant, 'Em conversa', '#d98a9c', 2),
      (v_tenant, 'Agendado',    '#8ab5a0', 3);
  end if;

  for i in 1..20 loop
    insert into public.leads (id, tenant_id, branch_id, name, phone, source, crm_stage_id, client_id, created_at)
    values (
      ('dddddddd-9000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid,
      v_tenant, null,
      'Lead Demo ' || lpad(i::text, 2, '0'),
      '1197777' || lpad(i::text, 4, '0'),
      case when i % 3 = 0 then 'instagram' when i % 3 = 1 then 'whatsapp' else 'indicacao' end,
      v_stage,
      case when i <= 8
           then ('dddddddd-2000-0000-0000-0000000000' || lpad(to_hex(i), 2, '0'))::uuid
           else null end,
      v_month + ((i - 1) || ' hours')::interval + interval '9 hours'
    );
  end loop;
end $seed$;
