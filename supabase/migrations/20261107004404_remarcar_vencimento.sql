-- A37 da 9ª simulação (2026-11-07): não havia como remarcar o vencimento de uma
-- parcela do crediário — a linha só tinha "Pagar". Quem tem o Financeiro em
-- Gerenciar remarca (a action confere a permissão e a unidade); o lançamento
-- guarda o histórico de cada remarcação (de, para, quem, quando, o motivo), e a
-- lista o mostra. O que já foi pago ou estornado não se remarca.

alter table public.financial_transactions
  add column if not exists vencimentos_anteriores jsonb not null default '[]'::jsonb;

comment on column public.financial_transactions.vencimentos_anteriores is
  'As remarcações do vencimento (A37 da 9ª): [{de, para, por, por_nome, em, motivo}], da mais antiga para a mais nova.';

create or replace function public.lancamento_remarcar_vencimento(
  p_tenant uuid, p_lancamento uuid, p_vencimento timestamptz, p_ator uuid, p_ator_nome text, p_motivo text
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tx     public.financial_transactions%rowtype;
  v_tenant uuid;
begin
  select t.* into v_tx from public.financial_transactions t where t.id = p_lancamento for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0001';
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = v_tx.branch_id;
  if v_tenant is distinct from p_tenant then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_tx.is_paid then
    raise exception 'Este lançamento já foi pago: não há vencimento a remarcar.' using errcode = 'P0001';
  end if;
  if coalesce(v_tx.notes, '') = 'Estornada' or coalesce(v_tx.category, '') = 'Estorno' then
    raise exception 'Este lançamento foi estornado: não há vencimento a remarcar.' using errcode = 'P0001';
  end if;
  if p_vencimento is null then
    raise exception 'Escolha o novo vencimento.' using errcode = 'P0001';
  end if;

  update public.financial_transactions
     set due_date = p_vencimento,
         vencimentos_anteriores = coalesce(vencimentos_anteriores, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'de', v_tx.due_date, 'para', p_vencimento, 'por', p_ator, 'por_nome', p_ator_nome,
           'em', now(), 'motivo', nullif(trim(coalesce(p_motivo, '')), ''))),
         updated_at = now()
   where id = p_lancamento;
end $$;

revoke execute on function public.lancamento_remarcar_vencimento(uuid, uuid, timestamptz, uuid, text, text) from public, anon, authenticated;
grant execute on function public.lancamento_remarcar_vencimento(uuid, uuid, timestamptz, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
