-- O PDV e as comandas (a revisão do Heitor, 2026-11-13 — PDV1, PDV2, PDV3,
-- CX1 e CX3 do plano de adaptação, docs/revisao.md).
--
-- O Heitor: "vamos fazer um PDV. E aí tudo que foi relacionado a alguma coisa
-- que tenha cobrança vira uma comanda. E aí o pagamento acontece por dentro
-- desse PDV, seja do que for." Uma VENDA = uma comanda (PDV-P1).
--
-- A comanda é o CABEÇALHO da venda: de quem, de onde, de que origem. O
-- dinheiro continua nas tabelas de sempre (o lançamento do atendimento, o do
-- pacote, o do plano…), com as funções que já gravam, estornam, pontuam e
-- comissionam. Por isso a situação "paga" não se grava aqui: é o lançamento
-- vivo e pago da venda (o estorno a devolve a aberta, sem gatilho a mais).
-- Só o cancelamento se grava — o atendimento que não aconteceu.
--
-- Esta primeira parte é a comanda do ATENDIMENTO avulso: "quando inicia o
-- atendimento, gera a comanda. Aí fica a critério da clínica se precisa pagar
-- primeiro ou se paga depois" (PDV-P4). Agendar, confirmar e remarcar não
-- geram; a falta e o cancelamento (sem pagamento) a tiram. A sessão de plano
-- e a de pacote, o pré-pago e o de R$ 0 não têm o que cobrar: não têm comanda.

create table if not exists public.comandas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid not null references public.branches(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  -- O número que a tela mostra ("Comanda 42"), da rede: nasce no gatilho.
  numero            integer not null,
  origem            text not null check (origem in ('ATENDIMENTO', 'PLANO', 'VENDA')),
  appointment_id    uuid references public.appointments(id) on delete cascade,
  treatment_plan_id uuid references public.treatment_plans(id) on delete cascade,
  aberta_em         timestamptz not null default now(),
  -- A comanda que saiu sem cobrança: o atendimento cancelado ou a falta, ou o
  -- avulso que virou sessão de pacote ("Abater do pacote") ou pré-pago.
  cancelada_em      timestamptz,
  cancelada_motivo  text,
  constraint comandas_numero_da_rede unique (tenant_id, numero),
  constraint comandas_um_atendimento unique (appointment_id),
  constraint comandas_um_plano unique (treatment_plan_id),
  constraint comandas_origem_confere check (
    (origem = 'ATENDIMENTO') = (appointment_id is not null)
    and (origem = 'PLANO') = (treatment_plan_id is not null)
  )
);
create index if not exists comandas_unidade_aberta_em on public.comandas (branch_id, aberta_em desc);
create index if not exists comandas_cliente on public.comandas (client_id);

-- Só o servidor lê e grava (a action confere quem recebe e o alcance).
alter table public.comandas enable row level security;
create policy suporte_sem_escrita_ins on public.comandas as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.comandas as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.comandas as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- O número da comanda, um a um na rede (a trava serializa as duas que nascem juntas).
create or replace function private.comanda_numero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('comanda:' || new.tenant_id::text));
  select coalesce(max(c.numero), 0) + 1 into new.numero
    from public.comandas c where c.tenant_id = new.tenant_id;
  return new;
end;
$$;
drop trigger if exists trg_comanda_numero on public.comandas;
create trigger trg_comanda_numero before insert on public.comandas
  for each row execute function private.comanda_numero();

-- A comanda do atendimento: nasce no início (ou no atendimento que já chega
-- concluído, como o da importação), sai na falta e no cancelamento sem
-- pagamento. Vale em todo caminho que muda a situação (a agenda, o app, o
-- Copilot), sem cada um lembrar.
create or replace function private.comanda_do_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rede uuid;
begin
  if new.status::text in ('IN_PROGRESS', 'COMPLETED')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.client_id is not null
       and coalesce(new.price, 0) > 0
       and new.treatment_plan_id is null
       and not exists (select 1 from public.package_sessions ps where ps.appointment_id = new.id)
       and not exists (select 1 from public.procedure_sale_units u where u.appointment_id = new.id and u.status <> 'CANCELADA') then
      select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
      insert into public.comandas (tenant_id, branch_id, client_id, numero, origem, appointment_id)
      values (v_rede, new.branch_id, new.client_id, 0, 'ATENDIMENTO', new.id)
      on conflict (appointment_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and new.status::text in ('CANCELLED', 'NO_SHOW')
        and old.status is distinct from new.status then
    -- A paga fica: o dinheiro que entrou se desfaz pelo estorno.
    update public.comandas c
       set cancelada_em = now(),
           cancelada_motivo = case when new.status::text = 'NO_SHOW' then 'A cliente não compareceu' else 'Atendimento cancelado' end
     where c.appointment_id = new.id
       and c.cancelada_em is null
       and not exists (
         select 1 from public.financial_transactions f
          where f.appointment_id = new.id and f.is_paid and coalesce(f.notes, '') <> 'Estornada');
  end if;
  return null;
end;
$$;
drop trigger if exists trg_comanda_do_atendimento on public.appointments;
create trigger trg_comanda_do_atendimento after insert or update of status on public.appointments
  for each row execute function private.comanda_do_atendimento();

-- O avulso que passou a ser pago de outro jeito — a sessão do pacote da
-- cliente ("Abater do pacote", D9 de 2026-10-28) ou o procedimento pré-pago —
-- não tem mais o que cobrar: a comanda aberta sai.
create or replace function private.comanda_sem_cobranca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.appointment_id is not null
     and (tg_op = 'INSERT' or old.appointment_id is distinct from new.appointment_id)
     and (tg_table_name <> 'procedure_sale_units' or coalesce(to_jsonb(new) ->> 'status', '') <> 'CANCELADA') then
    update public.comandas c
       set cancelada_em = now(),
           cancelada_motivo = case tg_table_name when 'package_sessions' then 'Sessão do pacote' else 'Procedimento pré-pago' end
     where c.appointment_id = new.appointment_id
       and c.cancelada_em is null
       and not exists (
         select 1 from public.financial_transactions f
          where f.appointment_id = new.appointment_id and f.is_paid and coalesce(f.notes, '') <> 'Estornada');
  end if;
  return null;
end;
$$;
drop trigger if exists trg_comanda_sem_cobranca on public.package_sessions;
create trigger trg_comanda_sem_cobranca after insert or update of appointment_id on public.package_sessions
  for each row execute function private.comanda_sem_cobranca();
drop trigger if exists trg_comanda_sem_cobranca on public.procedure_sale_units;
create trigger trg_comanda_sem_cobranca after insert or update of appointment_id on public.procedure_sale_units
  for each row execute function private.comanda_sem_cobranca();

-- Pagar antes ou depois é só a ordem do trabalho (PDV-P4): o atendimento EM
-- ANDAMENTO também se recebe. Era só o concluído.
do $$
declare
  d text := pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure);
begin
  if position($t$if v_status <> 'COMPLETED' then$t$ in d) = 0 then
    raise exception 'confirmar_pagamento_do_atendimento mudou: a guarda da situação não está onde se esperava';
  end if;
  d := replace(d, $t$if v_status <> 'COMPLETED' then$t$, $t$if v_status not in ('IN_PROGRESS', 'COMPLETED') then$t$);
  d := replace(d, $t$'O atendimento precisa estar concluído para confirmar pagamento.'$t$,
                  $t$'O atendimento ainda não começou: a comanda nasce quando ele é iniciado.'$t$);
  execute d;
end $$;

-- As comandas do PDV de uma unidade. A situação sai do lançamento da venda:
--   ABERTAS — não canceladas e sem o lançamento vivo pago (de qualquer dia);
--   PAGAS   — pagas na janela;
--   TODAS   — as abertas, mais o que foi pago ou cancelado na janela.
-- O valor é o da venda (o preço do atendimento); o recebido, o do lançamento.
create or replace function public.pdv_comandas(
  p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz
) returns table (
  id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
  client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text,
  agendado_para timestamptz, atendimento_status text, valor numeric,
  paga boolean, paga_em timestamptz, recebido numeric, forma text, lancamento_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method::text as f_forma
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        select f.id, f.paid_at, f.amount, f.payment_method
          from public.financial_transactions f
         where f.appointment_id = c.appointment_id and f.is_paid
           and coalesce(f.notes, '') <> 'Estornada'
         order by f.paid_at desc nulls last
         limit 1
      ) f on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  )
  select c.id, c.numero, c.origem, c.aberta_em, c.cancelada_em, c.cancelada_motivo,
         c.client_id, cl.name, c.appointment_id, pr.name, u.name,
         c.scheduled_at, c.a_status, round(coalesce(c.price, 0), 2),
         c.f_id is not null, c.paid_at, round(c.amount, 2), c.f_forma, c.f_id
    from c
    left join public.clients cl on cl.id = c.client_id
    left join public.procedures pr on pr.id = c.procedure_id
    left join public.users u on u.id = c.professional_id
   where case p_situacao
           when 'ABERTAS' then c.cancelada_em is null and c.f_id is null
           when 'PAGAS'   then c.f_id is not null and c.paid_at between p_de and p_ate
           else (c.cancelada_em is null and c.f_id is null)
             or (c.f_id is not null and c.paid_at between p_de and p_ate)
             or (c.cancelada_em between p_de and p_ate)
         end
$$;
revoke execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
