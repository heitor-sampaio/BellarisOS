-- Comissões, fase 3: o fechamento. O financeiro fecha o que está a pagar de
-- um profissional numa unidade até o fim do período, paga, e isso vira uma
-- DESPESA paga no financeiro. Fechamento não se reabre: o que chegar depois
-- (um estorno, um ajuste) cai no próximo.

create table public.commission_payouts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  branch_id       uuid not null references public.branches(id),
  professional_id uuid not null references public.users(id),
  -- O lançamento mais antigo que entrou e o fim do período fechado.
  inicio          timestamptz not null,
  fim             timestamptz not null,
  total           numeric not null check (total > 0),
  transaction_id  uuid not null references public.financial_transactions(id),
  paid_at         timestamptz not null default now(),
  paid_by         uuid references public.users(id) on delete set null
);
create index idx_commission_payouts_prof on public.commission_payouts (tenant_id, professional_id, paid_at desc);

alter table public.commission_payouts enable row level security;
create policy commission_payouts_select on public.commission_payouts for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

alter table public.commissions
  add column payout_id uuid references public.commission_payouts(id) on delete set null;
create index idx_commissions_aberto on public.commissions (professional_id, branch_id)
  where status = 'OPEN' and payout_id is null;

-- ─── Fechar e pagar ──────────────────────────────────────────────────────────
create or replace function public.comissao_fechar(
  p_tenant uuid, p_profissional uuid, p_unidade uuid, p_fim timestamptz, p_ator uuid, p_metodo text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome   text;
  v_total  numeric;
  v_inicio timestamptz;
  v_tx     uuid;
  v_id     uuid;
begin
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select u.name into v_nome from public.users u where u.id = p_profissional and u.tenant_id = p_tenant;
  if not found then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Dois "fechar" ao mesmo tempo: o segundo espera e não acha mais nada.
  perform pg_advisory_xact_lock(hashtext('comissao_fechar:' || p_profissional::text || ':' || p_unidade::text));

  select coalesce(sum(c.amount), 0), min(c.released_at) into v_total, v_inicio
    from public.commissions c
   where c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

  if v_total = 0 then
    raise exception 'Nada a pagar a este profissional até o fim do período.' using errcode = 'P0001';
  end if;
  if v_total < 0 then
    raise exception 'O saldo do profissional está negativo (estornos maiores que o liberado): ele é descontado no próximo fechamento.'
      using errcode = 'P0001';
  end if;

  insert into public.financial_transactions
    (branch_id, type, category, description, amount, payment_method, is_paid, paid_at, created_by)
  values (
    p_unidade, 'EXPENSE', 'Comissões',
    'Comissões — ' || v_nome || ' — até ' || to_char(p_fim at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
    v_total, nullif(p_metodo, '')::public."PaymentMethod", true, now(), coalesce(p_ator::text, 'sistema')
  ) returning id into v_tx;

  insert into public.commission_payouts
    (tenant_id, branch_id, professional_id, inicio, fim, total, transaction_id, paid_by)
  values (p_tenant, p_unidade, p_profissional, v_inicio, p_fim, v_total, v_tx, p_ator)
  returning id into v_id;

  update public.commissions c
     set status = 'PAID', paid_at = now(), paid_by = coalesce(p_ator::text, 'sistema'), payout_id = v_id
   where c.professional_id = p_profissional and c.branch_id = p_unidade
     and c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim;

  return v_id;
end $$;

revoke execute on function public.comissao_fechar(uuid, uuid, uuid, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.comissao_fechar(uuid, uuid, uuid, timestamptz, uuid, text) to service_role;

-- ─── A tela: resumo por profissional e unidade ───────────────────────────────
-- liberado = lançado no período; a_pagar = aberto e não fechado até o fim do
-- período (inclui o que sobrou de antes); pago = fechamentos pagos no período.
create or replace function public.comissoes_resumo(
  p_tenant uuid, p_branch_ids uuid[], p_inicio timestamptz, p_fim timestamptz, p_profissional uuid
) returns table (professional_id uuid, professional_name text, branch_id uuid, branch_name text,
                 liberado numeric, a_pagar numeric, pago numeric)
language sql stable security definer set search_path = ''
as $$
  with escopo as (
    select b.id, b.name from public.branches b
     where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  lanc as (
    select c.professional_id, c.branch_id,
           sum(c.amount) filter (where c.released_at between p_inicio and p_fim) liberado,
           sum(c.amount) filter (where c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim) a_pagar
      from public.commissions c
      join escopo e on e.id = c.branch_id
     where (p_profissional is null or c.professional_id = p_profissional)
     group by 1, 2
  ),
  pag as (
    select p.professional_id, p.branch_id, sum(p.total) pago
      from public.commission_payouts p
      join escopo e on e.id = p.branch_id
     where p.paid_at between p_inicio and p_fim
       and (p_profissional is null or p.professional_id = p_profissional)
     group by 1, 2
  )
  select k.professional_id, u.name, k.branch_id, e.name,
         coalesce(l.liberado, 0), coalesce(l.a_pagar, 0), coalesce(g.pago, 0)
    from (select l.professional_id, l.branch_id from lanc l union select g.professional_id, g.branch_id from pag g) k
    join public.users u on u.id = k.professional_id
    join escopo e on e.id = k.branch_id
    left join lanc l on l.professional_id = k.professional_id and l.branch_id = k.branch_id
    left join pag  g on g.professional_id = k.professional_id and g.branch_id = k.branch_id
   where coalesce(l.liberado, 0) <> 0 or coalesce(l.a_pagar, 0) <> 0 or coalesce(g.pago, 0) <> 0
   order by u.name, e.name
$$;

-- ─── A tela: o extrato (o do período e o que ainda está a pagar) ─────────────
create or replace function public.comissoes_extrato(
  p_tenant uuid, p_branch_ids uuid[], p_inicio timestamptz, p_fim timestamptz, p_profissional uuid
) returns table (id uuid, professional_id uuid, branch_id uuid, released_at timestamptz, kind text, motivo text,
                 amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamptz,
                 cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo,
         c.amount, c.status::text, c.payout_id, c.appointment_id, a.scheduled_at,
         cli.name, pr.name, l.origem, l.preco, l.regra_tipo::text, l.regra_valor
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    left join public.commission_lines l on l.id = c.line_id
    left join public.appointments a on a.id = c.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and (p_profissional is null or c.professional_id = p_profissional)
     and (c.released_at between p_inicio and p_fim
          or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
   order by c.released_at desc
   limit 2000
$$;

revoke execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
revoke execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
