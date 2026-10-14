-- Seed de demonstração do relatório de VENDAS (Relatórios → Vendas, 2026-10-14).
--
-- Idempotente: tudo o que ele cria usa UUIDs com o prefixo 'dddddd5a' e é
-- apagado antes de recriar. O prefixo é outro que o do seed_demo.sql
-- ('dddddddd') de propósito: aquele apaga os clientes e profissionais dele, e
-- as vendas daqui o travariam pela chave estrangeira.
--
-- Usa os procedimentos reais da rede (Massagem e Botox) e o pacote do
-- catálogo "Botox + Massagem"; cria 3 profissionais, 10 clientes e o pacote
-- "Drenagem 10 sessões (demo)".
--
-- Valores esperados no MÊS CORRENTE (até hoje), rede inteira:
--   Procedimentos (avulso) ... 8 vendas   R$ 2.900,00
--       5 Massagens (200; uma com R$ 20 de desconto → 180) = 980
--     + 3 Botox de 640 (683,33 com desconto)                 = 1.920
--   Pacotes .................. 3 vendas   R$ 6.050,00   (1.500 + 1.350 + 3.200)
--   Pré-pagos ................ 2 vendas   R$ 2.800,00   (3× Botox 1.900 + 5× Massagem 900)
--   Planos ................... 2 vendas   R$ 4.100,00   (2.600 + 1.500)
--   Total .................... 15 vendas  R$ 15.850,00
-- E o que NÃO aparece: a sessão de pacote feita, a sessão de plano feita, o
-- atendimento cancelado, a avaliação de cortesia e o plano em rascunho.
-- No mês anterior: 1 pacote (1.500) e 1 massagem (200).
--
-- E a tela de DOCUMENTOS (mesma data): 8 termos e contratos dos mesmos clientes.
-- Nascem A_GERAR, como o gatilho os cria — a tela monta o texto ao abrir (e
-- cada um vira "a enviar" ou "faltam dados", conforme o cadastro). Na trilha:
-- 2 com link gerado (valendo 7 dias), 1 pedido no portal, 1 contrato de plano
-- enviado pelo WhatsApp e 1 dispensado. Os assinados são os 6 antigos da rede.

do $seed$
declare
  v_tenant   uuid := '880e0566-d467-4fdd-a3a9-fed682ad1cc3';
  v_bm       uuid := '2aa146cd-5416-4351-912d-268524054212';  -- Beira Mar
  v_sj       uuid := '770e37e4-b74b-4d58-9687-920e66fbd1ec';  -- São José
  v_massagem uuid := '8de9e6ed-5b1f-436a-a321-996d23bbe3f2';
  v_botox    uuid := '8ddf96c8-e89d-4928-ac92-0f34e673e86b';
  v_aval     uuid := 'ac75e749-2f43-4b38-bf76-d8697a2fa67c';
  v_combo    uuid := '894800d7-bc92-4c3e-9e93-83e30639dc43';  -- Botox + Massagem
  v_drenagem uuid := 'dddddd5a-2000-0000-0000-000000000001';
  p1 uuid := 'dddddd5a-1000-0000-0000-000000000001';
  p2 uuid := 'dddddd5a-1000-0000-0000-000000000002';
  p3 uuid := 'dddddd5a-1000-0000-0000-000000000003';
  v_mes      timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_hoje     timestamptz := now() - interval '1 hour';
  c          uuid[];
  i          int;
  v_appt     uuid;
  v_plano    uuid;
  v_sessao   uuid;
  v_cp       uuid;
  v_venda    uuid;
begin
  -- Toda data é "dia X do mês corrente" limitada a AGORA (v_hoje): no começo
  -- do mês as vendas se amontoam em hoje, mas nunca nascem no futuro.
  -- ── Limpeza do seed anterior ───────────────────────────────────────────────
  delete from public.document_sign_links    where issued_document_id in
         (select id from public.issued_documents where id::text like 'dddddd5a%' or client_id::text like 'dddddd5a%');
  delete from public.issued_documents       where id::text like 'dddddd5a%' or client_id::text like 'dddddd5a%';
  delete from public.financial_transactions where id::text like 'dddddd5a%';
  delete from public.package_sessions       where client_package_id::text like 'dddddd5a%';
  delete from public.client_packages        where id::text like 'dddddd5a%';
  delete from public.procedure_sale_units   where sale_id::text like 'dddddd5a%';
  delete from public.procedure_sales        where id::text like 'dddddd5a%';
  delete from public.treatment_plan_session_procedures
         where session_id in (select id from public.treatment_plan_sessions where plan_id::text like 'dddddd5a%');
  delete from public.treatment_plan_sessions where plan_id::text like 'dddddd5a%';
  delete from public.appointments           where id::text like 'dddddd5a%';
  delete from public.treatment_plans        where id::text like 'dddddd5a%';
  delete from public.service_package_items  where package_id::text like 'dddddd5a%';
  delete from public.service_packages       where id::text like 'dddddd5a%';
  delete from public.loyalty_accounts       where client_id::text like 'dddddd5a%';
  delete from public.domain_events          where entidade_id::text like 'dddddd5a%';
  delete from public.clients                where id::text like 'dddddd5a%';
  delete from public.users                  where id::text like 'dddddd5a%';

  -- ── Equipe e clientes ──────────────────────────────────────────────────────
  insert into public.users (id, tenant_id, branch_id, auth_id, name, email, is_active, provides_services)
  values
    (p1, v_tenant, v_bm, 'dddddd5a-1000-0000-0000-00000000a001', 'Juliana Alves (demo)', 'juliana.vendas.demo@bellaris.com.br', true, true),
    (p2, v_tenant, v_bm, 'dddddd5a-1000-0000-0000-00000000a002', 'Marina Costa (demo)',  'marina.vendas.demo@bellaris.com.br',  true, true),
    (p3, v_tenant, v_sj, 'dddddd5a-1000-0000-0000-00000000a003', 'Paula Reis (demo)',    'paula.vendas.demo@bellaris.com.br',   true, true);

  c := array[]::uuid[];
  for i in 1..10 loop
    c := c || ('dddddd5a-3000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.clients (id, tenant_id, branch_id, name, phone, is_active, created_at)
    values (c[i], v_tenant, case when i <= 7 then v_bm else v_sj end,
            (array['Larissa Mendes','Fernanda Lima','Camila Rocha','Beatriz Souza','Renata Dias',
                   'Patrícia Gomes','Aline Martins','Vanessa Prado','Gabriela Nunes','Tatiane Freitas'])[i] || ' (demo)',
            '0098877' || lpad(i::text, 4, '0'), true, v_mes - interval '40 days');
  end loop;

  -- ── O pacote do catálogo ───────────────────────────────────────────────────
  insert into public.service_packages (id, tenant_id, branch_id, procedure_id, name, total_sessions, price, validity_days, is_active)
  values (v_drenagem, v_tenant, null, v_massagem, 'Drenagem 10 sessões (demo)', 10, 1500, 180, true);
  insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity)
  values (v_tenant, v_drenagem, v_massagem, 10);

  -- ── 1. Procedimentos avulsos concluídos (e pagos) ─────────────────────────
  -- (dia, cliente, procedimento, profissional, unidade, preço, desconto)
  for i in 1..8 loop
    v_appt := ('dddddd5a-4000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.appointments (id, branch_id, client_id, procedure_id, professional_id, status, source,
                                     scheduled_at, duration_min, price, completed_at)
    values (v_appt,
            case when i <= 6 then v_bm else v_sj end,
            c[i],
            case when i <= 5 then v_massagem else v_botox end,
            case when i <= 3 then p1 when i <= 6 then p2 else p3 end,
            'COMPLETED', 'INTERNAL',
            least(v_mes + ((i - 1) % 12 || ' days')::interval + interval '13 hours', v_hoje),
            60,
            case when i <= 5 then 200 else 683.33 end,
            least(v_mes + ((i - 1) % 12 || ' days')::interval + interval '14 hours', v_hoje));
    insert into public.financial_transactions (id, branch_id, client_id, appointment_id, type, category, description,
                                               amount, sale_discount, payment_method, is_paid, paid_at, created_by)
    values (('dddddd5a-5000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            case when i <= 6 then v_bm else v_sj end, c[i], v_appt, 'INCOME', 'Serviços',
            case when i <= 5 then 'Massagem' else 'Botox' end,
            case when i = 4 then 180 when i <= 5 then 200 else 640 end,
            case when i = 4 then 20 when i <= 5 then 0 else 43.33 end,
            case when i % 2 = 0 then 'PIX' else 'CREDIT_CARD' end::"PaymentMethod",
            true, least(v_mes + ((i - 1) % 12 || ' days')::interval + interval '14 hours', v_hoje), p1::text);
  end loop;

  -- Não são venda: cancelado e avaliação de cortesia.
  insert into public.appointments (id, branch_id, client_id, procedure_id, professional_id, status, source, scheduled_at, duration_min, price)
  values
    ('dddddd5a-4000-0000-0000-000000000090', v_bm, c[9], v_botox, p2, 'CANCELLED', 'INTERNAL', least(v_mes + interval '2 days 15 hours', v_hoje), 60, 683.33),
    ('dddddd5a-4000-0000-0000-000000000091', v_bm, c[10], v_aval, p1, 'COMPLETED', 'INTERNAL', least(v_mes + interval '3 days 10 hours', v_hoje), 30, 0);

  -- ── 2. Pacotes vendidos ────────────────────────────────────────────────────
  -- (cliente, pacote, preço de tabela, desconto, vendido por, dia)
  for i in 1..3 loop
    v_cp := ('dddddd5a-6000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.client_packages (id, client_id, package_id, branch_id, purchased_at, expires_at,
                                        total_sessions, used_sessions, price, preco_tabela, desconto, sold_by)
    values (v_cp, c[i + 1],
            case when i = 3 then v_combo else v_drenagem end,
            v_bm,
            least(v_mes + ((i * 3) || ' days')::interval + interval '16 hours', v_hoje),
            v_mes + interval '180 days',
            case when i = 3 then 2 else 10 end, case when i = 1 then 1 else 0 end,
            case when i = 1 then 1500 when i = 2 then 1350 else 3200 end,
            case when i = 3 then 3200 else 1500 end,
            case when i = 2 then 150 else 0 end,
            case when i = 2 then p2 else p1 end);
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
    select v_cp, 'AVAILABLE', n, case when i = 3 and n = 1 then v_botox else v_massagem end,
           case when i = 3 then 1600 when i = 1 then 150 else 135 end
      from generate_series(1, case when i = 3 then 2 else 10 end) n;
    insert into public.financial_transactions (id, branch_id, client_id, client_package_id, type, category, description,
                                               amount, payment_method, is_paid, paid_at, created_by)
    values (('dddddd5a-5000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, v_bm, c[i + 1], v_cp, 'INCOME',
            'Pacotes', 'Venda de pacote', case when i = 1 then 1500 when i = 2 then 1350 else 3200 end,
            'PIX', true, least(v_mes + ((i * 3) || ' days')::interval + interval '16 hours', v_hoje), p1::text);
  end loop;
  -- A 1ª sessão do primeiro pacote, feita: não é venda de novo.
  insert into public.appointments (id, branch_id, client_id, procedure_id, professional_id, status, source, scheduled_at, duration_min, price, completed_at)
  values ('dddddd5a-4000-0000-0000-000000000092', v_bm, c[2], v_massagem, p1, 'COMPLETED', 'INTERNAL',
          least(v_mes + interval '4 days 11 hours', v_hoje), 60, 150, least(v_mes + interval '4 days 12 hours', v_hoje));
  update public.package_sessions set status = 'USED', appointment_id = 'dddddd5a-4000-0000-0000-000000000092',
         used_at = least(v_mes + interval '4 days 12 hours', v_hoje)
   where client_package_id = 'dddddd5a-6000-0000-0000-000000000001' and session_number = 1;

  -- ── 3. Procedimentos pré-pagos ────────────────────────────────────────────
  for i in 1..2 loop
    v_venda := ('dddddd5a-7000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.procedure_sales (id, tenant_id, branch_id, client_id, procedure_id, quantity,
                                        preco_unitario_tabela, preco_tabela, desconto, price, sold_by, sold_at)
    values (v_venda, v_tenant, case when i = 1 then v_bm else v_sj end, c[i + 4],
            case when i = 1 then v_botox else v_massagem end,
            case when i = 1 then 3 else 5 end,
            case when i = 1 then 683.33 else 200 end,
            case when i = 1 then 2049.99 else 1000 end,
            case when i = 1 then 149.99 else 100 end,
            case when i = 1 then 1900 else 900 end,
            case when i = 1 then p2 else p3 end,
            least(v_mes + ((i * 5) || ' days')::interval + interval '17 hours', v_hoje));
    insert into public.procedure_sale_units (sale_id, numero, preco)
    select v_venda, n, case when i = 1 then (case when n = 3 then 633.34 else 633.33 end) else 180 end
      from generate_series(1, case when i = 1 then 3 else 5 end) n;
    insert into public.financial_transactions (id, branch_id, client_id, procedure_sale_id, type, category, description,
                                               amount, payment_method, is_paid, paid_at, created_by)
    values (('dddddd5a-5000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid,
            case when i = 1 then v_bm else v_sj end, c[i + 4], v_venda, 'INCOME', 'Pré-pago', 'Procedimento pré-pago',
            case when i = 1 then 1900 else 900 end, 'CREDIT_CARD', true,
            least(v_mes + ((i * 5) || ' days')::interval + interval '17 hours', v_hoje), p1::text);
  end loop;

  -- ── 4. Planos de tratamento fechados ──────────────────────────────────────
  for i in 1..2 loop
    v_plano := ('dddddd5a-8000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.treatment_plans (id, client_id, branch_id, professional_id, status, name, aceito_em, created_at)
    values (v_plano, c[i + 6], case when i = 1 then v_bm else v_sj end, case when i = 1 then p1 else p3 end,
            'ACCEPTED', case when i = 1 then 'Rejuvenescimento facial' else 'Relaxamento e drenagem' end,
            least(v_mes + ((i * 4 + 1) || ' days')::interval + interval '15 hours', v_hoje),
            least(v_mes + ((i * 4) || ' days')::interval, v_hoje));
    -- Plano 1: 2 sessões (Botox 1.300 cada) = 2.600. Plano 2: 3 de Massagem 500 = 1.500.
    for n in 1..(case when i = 1 then 2 else 3 end) loop
      insert into public.treatment_plan_sessions (plan_id, sort_order) values (v_plano, n - 1) returning id into v_sessao;
      insert into public.treatment_plan_session_procedures (session_id, procedure_id, price, preco_tabela)
      values (v_sessao, case when i = 1 then v_botox else v_massagem end,
              case when i = 1 then 1300 else 500 end, case when i = 1 then 1366.66 else 500 end);
      -- A 1ª sessão do plano 2, feita: já foi vendida no plano.
      if i = 2 and n = 1 then
        insert into public.appointments (id, branch_id, client_id, procedure_id, professional_id, status, source,
                                         scheduled_at, duration_min, price, completed_at, treatment_plan_id)
        values ('dddddd5a-4000-0000-0000-000000000093', v_sj, c[8], v_massagem, p3, 'COMPLETED', 'INTERNAL',
                least(v_mes + interval '10 days 10 hours', v_hoje), 60, 500, least(v_mes + interval '10 days 11 hours', v_hoje), v_plano);
        update public.treatment_plan_sessions set appointment_id = 'dddddd5a-4000-0000-0000-000000000093' where id = v_sessao;
      end if;
    end loop;
    insert into public.financial_transactions (id, branch_id, client_id, treatment_plan_id, type, category, description,
                                               amount, payment_method, is_paid, paid_at, created_by)
    values (('dddddd5a-5000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid,
            case when i = 1 then v_bm else v_sj end, c[i + 6], v_plano, 'INCOME', 'Serviços',
            'Plano de tratamento', case when i = 1 then 2600 else 1500 end, 'PIX', true,
            least(v_mes + ((i * 4 + 1) || ' days')::interval + interval '15 hours', v_hoje), p1::text);
  end loop;
  -- Rascunho: não é venda.
  insert into public.treatment_plans (id, client_id, branch_id, professional_id, status, name)
  values ('dddddd5a-8000-0000-0000-000000000099', c[9], v_bm, p2, 'DRAFT', 'Proposta em montagem');

  -- ── Mês anterior ───────────────────────────────────────────────────────────
  insert into public.client_packages (id, client_id, package_id, branch_id, purchased_at, total_sessions, used_sessions,
                                      price, preco_tabela, desconto, sold_by)
  values ('dddddd5a-6000-0000-0000-000000000099', c[1], v_drenagem, v_bm, v_mes - interval '12 days', 10, 0, 1500, 1500, 0, p1);
  insert into public.appointments (id, branch_id, client_id, procedure_id, professional_id, status, source, scheduled_at, duration_min, price, completed_at)
  values ('dddddd5a-4000-0000-0000-000000000099', v_bm, c[1], v_massagem, p2, 'COMPLETED', 'INTERNAL',
          v_mes - interval '8 days', 60, 200, v_mes - interval '8 days' + interval '1 hour');

  -- ── Documentos ─────────────────────────────────────────────────────────────
  -- Os termos dos atendimentos avulsos (modelo "Teste 2") e o contrato do plano 1.
  for i in 1..7 loop
    insert into public.issued_documents (id, tenant_id, branch_id, client_id, template_id, template_version_id,
                                         appointment_id, procedure_id, kind, source, title, moment, enforcement, status,
                                         closed_reason, closed_at, created_at)
    values (('dddddd5a-9000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, v_tenant,
            case when i <= 6 then v_bm else v_sj end, c[i],
            'f98f677f-f064-4a3a-a604-5c8c5714be9b', 'b7c7ac43-ae23-4c80-a9b0-c21f92dc9ab9',
            ('dddddd5a-4000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
            case when i <= 5 then v_massagem else v_botox end,
            'TERMO', 'EDITOR', 'Teste 2', 'AGENDAMENTO', 'BLOQUEIA',
            case when i = 7 then 'DISPENSADO' else 'A_GERAR' end,
            case when i = 7 then 'Cliente assinou o termo em papel na outra unidade' end,
            case when i = 7 then v_hoje end,
            least(v_mes + ((i - 1) || ' days')::interval + interval '9 hours', v_hoje));
  end loop;
  insert into public.issued_documents (id, tenant_id, branch_id, client_id, template_id, template_version_id,
                                       treatment_plan_id, kind, source, title, moment, enforcement, status, created_at)
  values ('dddddd5a-9000-0000-0000-000000000008', v_tenant, v_bm, c[7],
          'b937a637-5ffe-4d8c-9e55-93d39386581a', '140dd35e-66c8-40ba-a2c3-82e908383229',
          'dddddd5a-8000-0000-0000-000000000001', 'CONTRATO_PLANO', 'EDITOR',
          'Termo / Contrato de Prestação de Serviços', 'FECHAMENTO_PLANO', 'BLOQUEIA', 'A_GERAR',
          least(v_mes + interval '5 days 10 hours', v_hoje));

  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, channel, created_at)
  select d.id, v_tenant, 'EMITIDO', null, null, d.created_at
    from public.issued_documents d where d.id::text like 'dddddd5a%';
  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, channel, details, created_at)
  values
    ('dddddd5a-9000-0000-0000-000000000002', v_tenant, 'LINK_GERADO', p1, 'LINK', null, least(v_mes + interval '1 day 11 hours', v_hoje)),
    ('dddddd5a-9000-0000-0000-000000000003', v_tenant, 'LINK_GERADO', p1, 'LINK', null, least(v_mes + interval '2 days 11 hours', v_hoje)),
    ('dddddd5a-9000-0000-0000-000000000004', v_tenant, 'NOTIFICADO_PORTAL', p2, null, null, least(v_mes + interval '3 days 11 hours', v_hoje)),
    ('dddddd5a-9000-0000-0000-000000000008', v_tenant, 'LINK_GERADO', p1, 'LINK', null, least(v_mes + interval '5 days 11 hours', v_hoje)),
    ('dddddd5a-9000-0000-0000-000000000008', v_tenant, 'LINK_ENVIADO_CONVERSA', p1, 'LINK', null, least(v_mes + interval '5 days 11 hours', v_hoje));
  -- Os links valendo (o token é aleatório e não se mostra: é só para a tela).
  insert into public.document_sign_links (tenant_id, issued_document_id, token_hash, expires_at, created_by, created_at)
  select v_tenant, d, md5(random()::text) || md5(random()::text), now() + interval '7 days', p1, now()
    from unnest(array['dddddd5a-9000-0000-0000-000000000002', 'dddddd5a-9000-0000-0000-000000000003',
                      'dddddd5a-9000-0000-0000-000000000008']::uuid[]) d;
end
$seed$;
