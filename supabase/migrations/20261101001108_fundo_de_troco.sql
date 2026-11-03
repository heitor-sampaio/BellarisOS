-- ven-03 da revisão das decisões (2026-11-02; o Heitor: "flexibilidade,
-- precisamos dar as opções para que a rede possa operar da maneira que melhor
-- lhe convier"). O Fechamento do dia ganha um "Fundo de troco" OPCIONAL, o
-- dinheiro que já estava na gaveta no começo do dia. Informado, o esperado em
-- espécie é o fundo + o saldo em dinheiro do dia; sem fundo, segue como hoje.
--
-- Um por unidade e dia (informar de novo troca o valor). Só o servidor lê e
-- grava (sem política permissiva), como `fechamentos_do_dia`; e o fechamento
-- guarda o fundo no retrato.

create table if not exists public.fundos_de_troco (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  branch_id          uuid not null references public.branches(id) on delete cascade,
  dia                date not null,
  valor              numeric not null check (valor >= 0),
  informado_por      uuid references public.users(id) on delete set null,
  informado_por_nome text,
  informado_em       timestamptz not null default now(),
  unique (branch_id, dia)
);

alter table public.fundos_de_troco enable row level security;

create policy suporte_sem_escrita_ins on public.fundos_de_troco as restrictive for insert
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_upd on public.fundos_de_troco as restrictive for update
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end)
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_del on public.fundos_de_troco as restrictive for delete
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);

alter table public.fechamentos_do_dia add column if not exists fundo_de_troco numeric;
