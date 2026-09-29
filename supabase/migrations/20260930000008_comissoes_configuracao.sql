-- Comissões, fase 1: a configuração da rede, as taxas da maquininha e as
-- regras por profissional (plano de 2026-09-30, decisões do Heitor).
--
-- Até aqui a comissão nascia de `commission_rules`, mas nenhuma tela criava
-- regra — só o seed e os testes. E a tabela tinha política de INSERT e UPDATE
-- aberta a qualquer membro da unidade pela sessão: dava para qualquer um
-- escrever a própria comissão pela chave pública. Fecha aqui: a sessão só LÊ;
-- quem grava é o servidor (`actions/comissoes.ts`).
--
-- Compatível com o código no ar: `branch_id` das regras continua existindo
-- (vira opcional) porque o `finishSession` de antes filtra por ele; sai numa
-- migration depois do deploy.

-- ─── Configuração da rede ────────────────────────────────────────────────────
create table public.commission_configs (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  -- ATENDIMENTO: nasce ao concluir, sobre o preço. PAGAMENTO: vale quando o
  -- cliente paga, sobre o recebido (fase 2).
  modo             text not null default 'ATENDIMENTO' check (modo in ('ATENDIMENTO', 'PAGAMENTO')),
  desconta_insumos boolean not null default false,
  desconta_taxa    boolean not null default false,
  -- Quando o cliente usa pontos/voucher (no modo ATENDIMENTO): comissão sobre
  -- o preço ou sobre o que ele pagou. Era `loyalty_configs.commission_base`.
  base_com_pontos  text not null default 'PRECO' check (base_com_pontos in ('PRECO', 'VALOR_PAGO')),
  periodo          text not null default 'MENSAL' check (periodo in ('MENSAL', 'QUINZENAL', 'SEMANAL')),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id)
);

insert into public.commission_configs (tenant_id, base_com_pontos)
select l.tenant_id, l.commission_base from public.loyalty_configs l
on conflict (tenant_id) do nothing;

-- ─── Taxas da maquininha ─────────────────────────────────────────────────────
-- Por meio e número de parcelas (só o crédito parcela). Usadas para descontar
-- a taxa da base da comissão, quando a rede escolhe.
create table public.payment_fees (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  metodo     text not null check (metodo in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')),
  parcelas   int  not null default 1 check (parcelas between 1 and 12 and (metodo = 'CREDIT_CARD' or parcelas = 1)),
  taxa_pct   numeric(6,3) not null check (taxa_pct >= 0 and taxa_pct <= 100),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metodo, parcelas)
);

-- ─── Regras por profissional (padrão + exceções por procedimento) ────────────
alter table public.commission_rules add column tenant_id uuid references public.tenants(id);
update public.commission_rules r set tenant_id = b.tenant_id from public.branches b where b.id = r.branch_id;
alter table public.commission_rules alter column tenant_id set not null;

-- Era TEXTO — nenhuma chave garantia que o profissional existia.
alter table public.commission_rules alter column professional_id type uuid using professional_id::uuid;
alter table public.commission_rules
  add constraint commission_rules_professional_id_fkey foreign key (professional_id) references public.users(id);

-- A regra é do profissional na REDE (ele pode atender em qualquer unidade).
alter table public.commission_rules alter column branch_id drop not null;

alter table public.commission_rules
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references public.users(id);

-- Duas regras gerais ativas escolhiam uma "qualquer" (`limit 1`). Agora: um
-- padrão (procedure_id nulo) e uma exceção por procedimento, por profissional.
delete from public.commission_rules a using public.commission_rules b
 where a.professional_id = b.professional_id
   and a.procedure_id is not distinct from b.procedure_id
   and a.created_at < b.created_at;
create unique index uniq_commission_rules_profissional_procedimento
  on public.commission_rules (professional_id, procedure_id) nulls not distinct;
create index idx_commission_rules_tenant on public.commission_rules (tenant_id);

alter table public.commission_rules
  add constraint commission_rules_valor check (value >= 0 and (type <> 'PERCENTAGE' or value <= 100));

-- ─── Gravar as regras de um profissional (padrão + exceções), numa transação ─
-- Substitui o conjunto inteiro: o que não veio sai. O profissional e cada
-- procedimento têm de ser da rede — o id vem do navegador.
create or replace function public.comissao_regras_definir(
  p_tenant uuid, p_profissional uuid, p_padrao jsonb, p_excecoes jsonb, p_ator uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if not exists (select 1 from public.users u where u.id = p_profissional and u.tenant_id = p_tenant) then
    raise exception 'Profissional não encontrado.' using errcode = 'no_data_found';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_excecoes, '[]'::jsonb)) e
     where not exists (select 1 from public.procedures p where p.id = (e->>'procedure_id')::uuid and p.tenant_id = p_tenant)
  ) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;

  delete from public.commission_rules r where r.professional_id = p_profissional and r.tenant_id = p_tenant;

  if p_padrao is not null then
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, p_profissional, null, (p_padrao->>'tipo')::public."CommissionType", (p_padrao->>'valor')::numeric, true, p_ator);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_excecoes, '[]'::jsonb)) loop
    insert into public.commission_rules (tenant_id, professional_id, procedure_id, type, value, is_active, updated_by)
    values (p_tenant, p_profissional, (v_item->>'procedure_id')::uuid, (v_item->>'tipo')::public."CommissionType",
            (v_item->>'valor')::numeric, true, p_ator);
  end loop;
end $$;

revoke execute on function public.comissao_regras_definir(uuid, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.comissao_regras_definir(uuid, uuid, jsonb, jsonb, uuid) to service_role;

-- ─── RLS: a sessão só lê, e só a própria rede ────────────────────────────────
drop policy if exists commission_rules_insert on public.commission_rules;
drop policy if exists commission_rules_update on public.commission_rules;
drop policy if exists commission_rules_select on public.commission_rules;
create policy commission_rules_select on public.commission_rules for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

alter table public.commission_configs enable row level security;
alter table public.payment_fees       enable row level security;
create policy commission_configs_select on public.commission_configs for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);
create policy payment_fees_select on public.payment_fees for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

notify pgrst, 'reload schema';
