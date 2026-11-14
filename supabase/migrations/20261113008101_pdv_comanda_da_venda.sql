-- O PDV, fase 2: toda VENDA é uma comanda (a revisão do Heitor, 2026-11-13 —
-- PDV2, PDV5, PDV6 e PDV7 do plano de adaptação, docs/revisao.md).
--
-- O Heitor: "Uma comanda para cada coisa" (PDV-P1) e "E pelo PDV daí também
-- dá para vender o que tiver de produto". A venda de pacote, de procedimento
-- pré-pago, de produto e de crédito na rede ganha a comanda dela, ligada à
-- venda (uma coluna por tipo, cada uma única).
--
-- A comanda nasce do PRIMEIRO lançamento de receita da venda (o gatilho em
-- financial_transactions): é ele que diz que a venda aconteceu, e é o único
-- ponto comum às quatro funções que vendem (pacote_vender, procedimento_vender,
-- produto_vender_itens, a do crédito). As parcelas seguintes e o "lançar o
-- usado de novo" do cancelamento caem no on conflict. O pacote trazido de fora
-- não tem lançamento e, portanto, não tem comanda — não foi venda.

alter table public.comandas
  add column if not exists client_package_id  uuid references public.client_packages(id) on delete cascade,
  add column if not exists procedure_sale_id  uuid references public.procedure_sales(id) on delete cascade,
  add column if not exists product_sale_id    uuid references public.product_sales(id) on delete cascade,
  add column if not exists credito_vendido_id uuid references public.creditos_vendidos(id) on delete cascade;

alter table public.comandas add constraint comandas_um_pacote   unique (client_package_id);
alter table public.comandas add constraint comandas_um_prepago  unique (procedure_sale_id);
alter table public.comandas add constraint comandas_um_produto  unique (product_sale_id);
alter table public.comandas add constraint comandas_um_credito  unique (credito_vendido_id);

alter table public.comandas drop constraint comandas_origem_confere;
alter table public.comandas add constraint comandas_origem_confere check (
  num_nonnulls(appointment_id, treatment_plan_id, client_package_id, procedure_sale_id, product_sale_id, credito_vendido_id) = 1
  and (origem = 'ATENDIMENTO') = (appointment_id is not null)
  and (origem = 'PLANO') = (treatment_plan_id is not null)
);

create or replace function private.comanda_da_venda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rede    uuid;
  v_cliente uuid;
begin
  if new.type::text <> 'INCOME' or new.estorno_de is not null
     or new.appointment_id is not null or new.treatment_plan_id is not null
     or num_nonnulls(new.client_package_id, new.procedure_sale_id, new.product_sale_id, new.credito_vendido_id) <> 1 then
    return null;
  end if;
  select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
  v_cliente := coalesce(
    new.client_id,
    (select cp.client_id from public.client_packages cp where cp.id = new.client_package_id),
    (select s.client_id from public.procedure_sales s where s.id = new.procedure_sale_id),
    (select s.client_id from public.product_sales s where s.id = new.product_sale_id),
    (select s.client_id from public.creditos_vendidos s where s.id = new.credito_vendido_id));
  if v_rede is null or v_cliente is null then
    return null;
  end if;
  insert into public.comandas (tenant_id, branch_id, client_id, numero, origem,
                               client_package_id, procedure_sale_id, product_sale_id, credito_vendido_id)
  values (v_rede, new.branch_id, v_cliente, 0, 'VENDA',
          new.client_package_id, new.procedure_sale_id, new.product_sale_id, new.credito_vendido_id)
  on conflict do nothing;
  return null;
end;
$$;
drop trigger if exists trg_comanda_da_venda on public.financial_transactions;
create trigger trg_comanda_da_venda after insert on public.financial_transactions
  for each row execute function private.comanda_da_venda();

-- A lista do PDV, agora com as vendas. A venda nasce paga (vendida com a
-- forma escolhida, à vista ou no crediário): "paga" é a hora da venda, o
-- valor é o da venda, o recebido é o que entrou dela. A estornada inteira
-- aparece como tal.
drop function if exists public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz);
create function public.pdv_comandas(
  p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz
) returns table (
  id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
  client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text,
  agendado_para timestamptz, atendimento_status text, valor numeric,
  paga boolean, paga_em timestamptz, recebido numeric, forma text, lancamento_id uuid, estornada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method::text as f_forma,
           v.valor as v_valor, v.recebido as v_recebido, v.forma as v_forma, v.estornada as v_estornada,
           case
             when c.client_package_id is not null then (select sp.name from public.client_packages cp
                 join public.service_packages sp on sp.id = cp.package_id where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select s.quantity || '× ' || pr.name from public.procedure_sales s
                 join public.procedures pr on pr.id = s.procedure_id where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select coalesce(nullif(s.descricao, ''), p.name) from public.product_sales s
                 left join public.products p on p.id = s.product_id where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then 'Crédito na rede'
           end as v_item,
           case
             when c.client_package_id is not null then (select u.name from public.client_packages cp
                 join public.users u on u.id = cp.sold_by where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select u.name from public.procedure_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select u.name from public.product_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then (select s.registrado_por_nome from public.creditos_vendidos s
                 where s.id = c.credito_vendido_id)
           end as v_quem
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        select f.id, f.paid_at, f.amount, f.payment_method
          from public.financial_transactions f
         where c.appointment_id is not null and f.appointment_id = c.appointment_id and f.is_paid
           and coalesce(f.notes, '') <> 'Estornada'
         order by f.paid_at desc nulls last
         limit 1
      ) f on true
      left join lateral (
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at))[1] as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada
          from public.financial_transactions t
         where c.origem = 'VENDA' and t.type::text = 'INCOME' and t.estorno_de is null
           and (t.client_package_id = c.client_package_id or t.procedure_sale_id = c.procedure_sale_id
                or t.product_sale_id = c.product_sale_id or t.credito_vendido_id = c.credito_vendido_id)
      ) v on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  )
  select c.id, c.numero, c.origem, c.aberta_em, c.cancelada_em, c.cancelada_motivo,
         c.client_id, cl.name, c.appointment_id,
         case when c.origem = 'VENDA' then c.v_item else pr.name end,
         case when c.origem = 'VENDA' then c.v_quem else u.name end,
         c.scheduled_at, c.a_status,
         round(case when c.origem = 'VENDA' then coalesce(c.v_valor, 0) else coalesce(c.price, 0) end, 2),
         c.origem = 'VENDA' or c.f_id is not null,
         case when c.origem = 'VENDA' then c.aberta_em else c.paid_at end,
         round(case when c.origem = 'VENDA' then c.v_recebido else c.amount end, 2),
         case when c.origem = 'VENDA' then c.v_forma else c.f_forma end,
         c.f_id,
         c.origem = 'VENDA' and coalesce(c.v_estornada, false)
    from c
    left join public.clients cl on cl.id = c.client_id
    left join public.procedures pr on pr.id = c.procedure_id
    left join public.users u on u.id = c.professional_id
   where case p_situacao
           when 'ABERTAS' then c.origem <> 'VENDA' and c.cancelada_em is null and c.f_id is null
           when 'PAGAS'   then (c.origem = 'VENDA' and c.aberta_em between p_de and p_ate)
                            or (c.f_id is not null and c.paid_at between p_de and p_ate)
           else (c.origem <> 'VENDA' and c.cancelada_em is null and c.f_id is null)
             or (c.origem = 'VENDA' and c.aberta_em between p_de and p_ate)
             or (c.f_id is not null and c.paid_at between p_de and p_ate)
             or (c.cancelada_em between p_de and p_ate)
         end
$$;
revoke execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
