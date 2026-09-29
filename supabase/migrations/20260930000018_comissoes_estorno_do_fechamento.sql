-- Comissões: estornar um fechamento pago (decisão do Heitor, 2026-09-30).
-- A despesa é estornada como qualquer lançamento (`estornar_transacao`:
-- contra-lançamento + a original marcada 'Estornada') e os lançamentos daquele
-- fechamento VOLTAM a "a pagar", prontos para um novo fechamento.
--
-- A despesa de um fechamento só se estorna por AQUI: estornada pelo
-- financeiro comum, o dinheiro voltaria e a comissão continuaria "paga".

alter table public.commission_payouts
  add column estornado_at           timestamptz,
  add column estornado_por          uuid references public.users(id) on delete set null,
  add column estorno_motivo         text,
  add column estorno_transaction_id uuid references public.financial_transactions(id);

-- ─── A despesa do fechamento não se estorna por fora ─────────────────────────
create or replace function private.despesa_de_fechamento_so_pelo_fechamento()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(new.notes, '') = 'Estornada' and coalesce(old.notes, '') <> 'Estornada'
     and coalesce(current_setting('app.estorno_de_fechamento', true), '') <> 'on'
     and exists (select 1 from public.commission_payouts p where p.transaction_id = new.id and p.estornado_at is null) then
    raise exception 'Esta despesa é de um fechamento de comissões: estorne pelo fechamento, em Financeiro → Comissões.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_despesa_de_fechamento
  before update of notes on public.financial_transactions
  for each row execute function private.despesa_de_fechamento_so_pelo_fechamento();

-- ─── Estornar o fechamento ───────────────────────────────────────────────────
create or replace function public.comissao_estornar_fechamento(
  p_tenant uuid, p_fechamento uuid, p_ator uuid, p_motivo text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_p      public.commission_payouts%rowtype;
  v_contra uuid;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga o motivo do estorno.' using errcode = 'P0001';
  end if;
  select * into v_p from public.commission_payouts p where p.id = p_fechamento for update;
  if not found or v_p.tenant_id is distinct from p_tenant then
    raise exception 'Fechamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_p.estornado_at is not null then
    raise exception 'Este fechamento já foi estornado.' using errcode = 'P0001';
  end if;

  perform set_config('app.estorno_de_fechamento', 'on', true);
  v_contra := public.estornar_transacao(v_p.transaction_id, p_tenant, coalesce(p_ator::text, 'sistema'));
  perform set_config('app.estorno_de_fechamento', 'off', true);

  update public.commissions c
     set status = 'OPEN', paid_at = null, paid_by = null, payout_id = null
   where c.payout_id = p_fechamento;

  update public.commission_payouts
     set estornado_at = now(), estornado_por = p_ator, estorno_motivo = trim(p_motivo), estorno_transaction_id = v_contra
   where id = p_fechamento;

  return v_contra;
end $$;

revoke execute on function public.comissao_estornar_fechamento(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.comissao_estornar_fechamento(uuid, uuid, uuid, text) to service_role;

-- ─── O "pago no período" não conta fechamento estornado ──────────────────────
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
       and p.estornado_at is null
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

revoke execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
