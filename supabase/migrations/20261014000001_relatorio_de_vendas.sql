-- O relatório de vendas (pedido do Heitor, 2026-10-14): tudo o que foi
-- VENDIDO no período, uma linha por venda — procedimento avulso, pacote,
-- procedimento pré-pago e plano —, com data, descrição, cliente, profissional
-- e valor.
--
-- Venda é o fato comercial, não o dinheiro. O pacote parcelado é UMA venda
-- (as parcelas são o financeiro), e o que a cliente vem fazer depois do que
-- já comprou não é venda de novo: a sessão do pacote, a unidade pré-paga e a
-- sessão do plano ficam fora. O avulso é o atendimento concluído que não
-- consumiu nada disso.
--
-- O que cada venda diz:
--   PROCEDIMENTO  scheduled_at (o eixo de serviceRevenue), o procedimento, o
--                 profissional que atendeu; vale o preço menos o desconto
--                 comercial da recepção (sale_discount). Pontos são forma de
--                 pagamento, não desconto da venda. Preço zero (a avaliação
--                 de cortesia) não é venda.
--   PACOTE        purchased_at, o nome do pacote, quem vendeu; vale o vendido.
--   PRE_PAGO      sold_at, o procedimento e a quantidade, quem vendeu; vale o
--                 vendido.
--   PLANO         aceito_em (coluna nova, abaixo), o nome do plano, o
--                 profissional do plano; vale a soma dos procedimentos dele
--                 (já com o desconto rateado — plano_aplicar_desconto).
--                 Plano cancelado depois de aceito sai: a venda se desfez.

-- ─── A aba nova ──────────────────────────────────────────────────────────────
alter table public.role_report_tabs drop constraint if exists role_report_tabs_tab_check;
alter table public.role_report_tabs add constraint role_report_tabs_tab_check check (tab in (
  'overview', 'financeiro', 'vendas', 'agenda', 'clientes',
  'procedimentos', 'profissionais', 'estoque', 'comercial'
));

-- Quem já via o Financeiro passa a ver as Vendas: é dinheiro do mesmo
-- tamanho, e nascer fechada para todo cargo esconderia a aba nova de quem
-- pediu por ela. Daqui em diante, a aba se marca na tela de Cargos.
insert into public.role_report_tabs (tenant_id, role_id, tab)
select r.tenant_id, r.role_id, 'vendas'
  from public.role_report_tabs r
 where r.tab = 'financeiro'
on conflict (role_id, tab) do nothing;

-- ─── Quando o plano virou venda ──────────────────────────────────────────────
-- O plano não guardava o momento do aceite: `updated_at` muda a cada sessão
-- agendada depois. O gatilho grava na passagem para ACCEPTED (pela tela ou por
-- quem for), e o aceite que já existia herda o evento `plano.aceito`, senão o
-- primeiro lançamento do plano, senão a última atualização.
alter table public.treatment_plans add column if not exists aceito_em timestamptz;

create or replace function private.plano_aceito_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ACCEPTED' and new.aceito_em is null
     and (tg_op = 'INSERT' or old.status is distinct from 'ACCEPTED') then
    new.aceito_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_plano_aceito_em on public.treatment_plans;
create trigger trg_plano_aceito_em
  before insert or update of status on public.treatment_plans
  for each row execute function private.plano_aceito_em();

update public.treatment_plans p
   set aceito_em = coalesce(
     (select min(e.ocorrido_em) from public.domain_events e
       where e.nome = 'plano.aceito' and e.entidade_id = p.id),
     (select min(t.created_at) from public.financial_transactions t
       where t.treatment_plan_id = p.id),
     p.updated_at)
 where p.status in ('ACCEPTED', 'COMPLETED', 'CANCELLED')
   and p.aceito_em is null;

create index if not exists treatment_plans_aceito_em_idx
  on public.treatment_plans (branch_id, aceito_em) where aceito_em is not null;

-- ─── As vendas do período ────────────────────────────────────────────────────
create or replace function public.metrics_vendas(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table(
  id uuid, tipo text, data timestamptz, descricao text, quantidade integer,
  cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric
)
language sql
stable
set search_path = ''
as $$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.scheduled_at, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    -- Um lançamento por atendimento (UNIQUE em appointment_id); a
    -- contra-transação do estorno não leva o atendimento.
    left join public.financial_transactions t on t.appointment_id = a.id
   where a.status = 'COMPLETED'
     and a.scheduled_at between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to

  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         coalesce((select sum(x.price)
                     from public.treatment_plan_session_procedures x
                     join public.treatment_plan_sessions ss on ss.id = x.session_id
                    where ss.plan_id = tp.id), 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = tp.professional_id
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
$$;

-- Uma página da lista, da mais recente para a mais antiga.
create or replace function public.metrics_vendas_pagina(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz,
  p_tipo text default null, p_limite integer default 50, p_offset integer default 0
)
returns table(
  id uuid, tipo text, data timestamptz, descricao text, quantidade integer,
  cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric
)
language sql
stable
set search_path = ''
as $$
  select v.*
    from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to) v
   where p_tipo is null or v.tipo = p_tipo
   order by v.data desc, v.id
   limit greatest(1, least(p_limite, 1000)) offset greatest(0, p_offset)
$$;

-- Quantas e quanto, por tipo — e o total (tipo nulo). A tela não soma.
create or replace function public.metrics_vendas_resumo(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table(tipo text, quantidade bigint, total numeric)
language sql
stable
set search_path = ''
as $$
  select v.tipo, count(*), coalesce(sum(v.valor), 0)
    from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to) v
   group by grouping sets ((v.tipo), ())
$$;

-- Recebem a rede por parâmetro: só o servidor.
revoke execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz) to service_role;
grant execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer) to service_role;
grant execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
