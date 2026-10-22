-- O fechamento do dia (2026-10-21, decisão do Heitor): sem abertura de caixa.
-- No fim do dia, o resumo do que entrou (e saiu) por forma de pagamento, a
-- conferência do dinheiro em espécie e quem fechou. Cada fechamento é um
-- REGISTRO — fechar de novo (recontou, entrou um pagamento atrasado) cria
-- outro; o mais recente é o que vale, e o histórico fica.

create table if not exists public.fechamentos_do_dia (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid not null references public.branches(id) on delete cascade,
  dia               date not null,
  -- O retrato do dia no momento do fechamento (forma, entradas, saídas, saldo).
  resumo            jsonb not null default '[]'::jsonb,
  esperado_dinheiro numeric(12,2) not null,
  contado_dinheiro  numeric(12,2) not null check (contado_dinheiro >= 0),
  diferenca         numeric(12,2) generated always as (contado_dinheiro - esperado_dinheiro) stored,
  observacao        text,
  fechado_por       uuid references public.users(id) on delete set null,
  fechado_por_nome  text,
  fechado_em        timestamptz not null default now()
);
create index if not exists fechamentos_do_dia_unidade_dia on public.fechamentos_do_dia (branch_id, dia, fechado_em desc);

-- Só o servidor lê e grava (a action confere módulo e alcance).
alter table public.fechamentos_do_dia enable row level security;
create policy suporte_sem_escrita_ins on public.fechamentos_do_dia as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.fechamentos_do_dia as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.fechamentos_do_dia as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- O dia por forma de pagamento: entradas (a regra de receita de sempre,
-- metrics_receitas_pagas) e saídas pagas, estorno fora dos dois lados, eixo em
-- paid_at. A linha TOTAL vem do banco — a tela não soma.
create or replace function public.metrics_fechamento_do_dia(
  p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz
) returns table (forma text, entradas numeric, saidas numeric, saldo numeric, lancamentos integer)
language sql stable security definer set search_path = ''
as $$
  with t as (
    select coalesce(r.payment_method::text, 'SEM_FORMA') as forma, r.amount as entrada, 0::numeric as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
    union all
    select coalesce(f.payment_method::text, 'SEM_FORMA'), 0, f.amount
      from public.financial_transactions f
      join public.branches b on b.id = f.branch_id
     where b.tenant_id = p_tenant and b.id = p_branch
       and f.type = 'EXPENSE' and f.is_paid and f.amount <> 0
       and coalesce(f.notes, '')    <> 'Estornada'
       and coalesce(f.category, '') <> 'Estorno'
       and coalesce(f.paid_at, f.created_at) between p_from and p_to
  )
  select coalesce(forma, 'TOTAL'), round(sum(entrada), 2), round(sum(saida), 2),
         round(sum(entrada) - sum(saida), 2), count(*)::integer
    from t
   group by grouping sets ((forma), ())
$$;
revoke execute on function public.metrics_fechamento_do_dia(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_do_dia(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
