-- A41 da 11ª simulação (decidido pelos princípios: o pacote segue liberando —
-- princípio 1, nada muda sem a clínica pedir; a tela avisa — princípio 2): o
-- pacote vendido no crediário (entrada de 150 e 3 × 100) liberava as 6 sessões
-- sem aviso de que havia R$ 300 em aberto ligados a ele. O em aberto de cada
-- pacote — os lançamentos de receita a receber dele, vivos — contado no banco,
-- para a ficha e o agendar da sessão dizerem.

create or replace function public.metrics_em_aberto_dos_pacotes(p_tenant uuid, p_pacotes uuid[])
returns table(client_package_id uuid, em_aberto numeric, parcelas integer, proximo_vencimento timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select f.client_package_id, round(sum(f.amount), 2), count(*)::integer, min(f.due_date)
    from public.financial_transactions f
    join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
   where f.client_package_id = any (p_pacotes)
     and f.type = 'INCOME' and not f.is_paid and f.amount > 0
     and coalesce(f.notes, '') <> 'Estornada'
   group by f.client_package_id
$$;

revoke execute on function public.metrics_em_aberto_dos_pacotes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_em_aberto_dos_pacotes(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
