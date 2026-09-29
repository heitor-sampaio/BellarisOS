-- Pacotes: um conjunto de procedimentos, iguais ou não (decisão do Heitor,
-- 2026-09-30) — "5 limpezas + 3 drenagens". Até aqui era UM procedimento × N.
--
-- - `service_package_items`: os itens do pacote (procedimento + quantidade).
--   `service_packages.total_sessions` vira a soma, e `procedure_id` o primeiro
--   item (as leituras que mostram "o procedimento do pacote" seguem certas).
-- - Cada sessão vendida (`package_sessions`) guarda o SEU procedimento e a SUA
--   parte do preço (`preco`): o preço do pacote rateado pelo preço de tabela
--   de cada procedimento (o app calcula, `lib/pacotes/rateio.ts`). É a base
--   da comissão da sessão.
-- - `pacote_salvar` grava pacote + itens numa transação; `pacote_vender` passa
--   a receber as sessões e confere que batem com os itens e com o preço.

create table public.service_package_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  package_id   uuid not null references public.service_packages(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id),
  quantity     int  not null check (quantity between 1 and 100),
  sort_order   int  not null default 0
);
create index idx_service_package_items_pacote on public.service_package_items (package_id);

alter table public.service_package_items enable row level security;
create policy service_package_items_select on public.service_package_items for select
  using (tenant_id = (public.jwt_claim('tenant_id'))::uuid);

insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity, sort_order)
select sp.tenant_id, sp.id, sp.procedure_id, sp.total_sessions, 0
  from public.service_packages sp
 where sp.procedure_id is not null
   and not exists (select 1 from public.service_package_items i where i.package_id = sp.id);

alter table public.package_sessions
  add column procedure_id uuid references public.procedures(id),
  add column preco        numeric check (preco is null or preco >= 0);

-- As sessões de antes são do procedimento único do pacote.
update public.package_sessions ps
   set procedure_id = sp.procedure_id
  from public.client_packages cp
  join public.service_packages sp on sp.id = cp.package_id
 where cp.id = ps.client_package_id and ps.procedure_id is null;

-- ─── Salvar o pacote e os itens, juntos ──────────────────────────────────────
-- p_itens: [{ procedure_id, quantity }] na ordem da tela.
create or replace function public.pacote_salvar(
  p_tenant uuid, p_id uuid, p_nome text, p_preco numeric, p_validade int, p_ativo boolean, p_itens jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id    uuid := p_id;
  v_total int;
  v_prim  uuid;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um procedimento ao pacote.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where not exists (select 1 from public.procedures p where p.id = (i ->> 'procedure_id')::uuid and p.tenant_id = p_tenant)
  ) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  select sum((i ->> 'quantity')::int), (array_agg((i ->> 'procedure_id')::uuid order by n))[1]
    into v_total, v_prim
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);
  if v_total < 2 then
    raise exception 'Um pacote tem pelo menos 2 sessões.' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.service_packages (tenant_id, branch_id, procedure_id, name, total_sessions, price, validity_days, is_active)
    values (p_tenant, null, v_prim, trim(p_nome), v_total, round(p_preco, 2), p_validade, p_ativo)
    returning id into v_id;
  else
    update public.service_packages
       set procedure_id = v_prim, name = trim(p_nome), total_sessions = v_total, price = round(p_preco, 2),
           validity_days = p_validade, is_active = p_ativo
     where id = v_id and tenant_id = p_tenant;
    if not found then
      raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
    end if;
    delete from public.service_package_items where package_id = v_id;
  end if;

  insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity, sort_order)
  select p_tenant, v_id, (i ->> 'procedure_id')::uuid, (i ->> 'quantity')::int, n::int - 1
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);

  return v_id;
end $$;

revoke execute on function public.pacote_salvar(uuid, uuid, text, numeric, int, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.pacote_salvar(uuid, uuid, text, numeric, int, boolean, jsonb) to service_role;

-- ─── Vender: as sessões vêm do app (procedimento + parte do preço) ───────────
drop function if exists public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb);

-- p_sessoes: [{ procedure_id, preco }] — uma por sessão. Nulo = o código de
-- antes do deploy: sessões pelos itens, sem parte do preço.
create or replace function public.pacote_vender(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_lancamentos jsonb,
  p_sessoes jsonb default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_pac   public.service_packages%rowtype;
  v_nome  text;
  v_cp    uuid;
  v_soma  numeric;
  v_l     jsonb;
  v_tx    uuid;
  v_agora timestamptz := now();
begin
  select * into v_pac from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not v_pac.is_active then
    raise exception 'Este pacote está desativado.' using errcode = 'P0001';
  end if;
  if v_pac.branch_id is not null and v_pac.branch_id <> p_unidade then
    raise exception 'Este pacote é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_nome from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if v_soma <> round(v_pac.price, 2) then
    raise exception 'O pagamento não fecha com o preço do pacote.' using errcode = 'P0001';
  end if;

  if p_sessoes is not null then
    -- As sessões batem com os itens: o mesmo número de cada procedimento.
    if exists (
      select 1 from (
        select i.procedure_id, sum(i.quantity) quantity from public.service_package_items i where i.package_id = p_pacote group by 1
      ) itens
      full join (
        select (s ->> 'procedure_id')::uuid procedure_id, count(*) n from jsonb_array_elements(p_sessoes) s group by 1
      ) sess on sess.procedure_id = itens.procedure_id
       where coalesce(itens.quantity, 0) <> coalesce(sess.n, 0)
    ) then
      raise exception 'As sessões não batem com os procedimentos do pacote.' using errcode = 'P0001';
    end if;
    if (select coalesce(sum(round((s ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_sessoes) s) <> round(v_pac.price, 2) then
      raise exception 'O rateio das sessões não fecha com o preço do pacote.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions, price, sold_by)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_pac.price, p_ator
  ) returning id into v_cp;

  if p_sessoes is not null then
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
    select v_cp, 'AVAILABLE', n::int, (s ->> 'procedure_id')::uuid, round((s ->> 'preco')::numeric, 2)
      from jsonb_array_elements(p_sessoes) with ordinality as t(s, n);
  else
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id)
    select v_cp, 'AVAILABLE', row_number() over (order by i.sort_order, g)::int, i.procedure_id
      from public.service_package_items i
      cross join lateral generate_series(1, i.quantity) g
     where i.package_id = p_pacote;
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name,
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema')
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_cp;
end $$;

revoke execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
