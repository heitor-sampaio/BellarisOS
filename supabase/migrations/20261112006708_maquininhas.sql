-- C75 do levantamento das regras (F67, 2026-11-12; D8, 4ª volta — o Heitor:
-- "Quem escolhe a taxa é a operadora: stone, mercadopago, elo e por ai vai…
-- a rede precisa configurar suas taxas, por operadora."): as taxas passam a
-- ser POR MAQUININHA.
--
-- - `maquininhas`: cada rede cadastra as suas — o nome, as taxas do débito e
--   do crédito de 1x a 12x (`taxas`, as chaves "DEBIT_CARD:1" e
--   "CREDIT_CARD:N", como a regra por bandeira de antes), até quantas vezes
--   parcela (`max_vezes`; nulo = a maior com taxa), o prazo de cada parcela, e
--   a opção FECHADA por padrão "Esta maquininha cobra diferente em alguma
--   bandeira?" (`cobra_por_bandeira` + `por_bandeira`, a forma de
--   `tenants.cartao_por_bandeira`). Configuração: a sessão não lê nem grava
--   (o servidor lê e grava pelo cliente de serviço, depois da trava).
-- - O Pix tem campo próprio, fora delas: `tenants.pix_taxa_pct`, padrão 0%.
-- - O lançamento guarda a maquininha da venda (`financial_transactions.
--   maquininha_id`). No cartão sem maquininha escolhida, o gatilho põe a
--   primeira ativa da rede (a única, no caso comum); o estorno herda a do
--   pagamento estornado. A de outra rede é recusada.
-- - A taxa, o prazo, o recebível da operadora, a comissão, a estimativa e a
--   lista do Fechamento leem a maquininha DO LANÇAMENTO. O lançamento antigo
--   (sem maquininha) lê a primeira cadastrada da rede — a que nasce aqui com a
--   configuração de antes —, então nada que já foi gravado muda de taxa.
--
-- MIGRAÇÃO DO QUE EXISTE: cada rede ganha a 1ª maquininha, "Maquininha", com
-- a regra geral de `payment_fees` (as taxas), `tenants.cartao_max_vezes`,
-- `tenants.cartao_prazo_dias` e `tenants.cartao_por_bandeira` (com a opção
-- da bandeira aberta quando havia regra por bandeira); o Pix de
-- `payment_fees` vai para `tenants.pix_taxa_pct`.
--
-- TRANSIÇÃO (até a limpeza destrutiva, com o Heitor): `payment_fees` e as
-- colunas `tenants.cartao_*` ficam, sem leitor, e o que se gravar nelas (o
-- código de antes do deploy; os testes antigos) é ESPELHADO na 1ª maquininha
-- da rede pelos gatilhos `trg_maquininha_espelha_*`. A tela nova grava só nas
-- maquininhas.
--
-- ADITIVA: só cria e troca corpos de função (as assinaturas antigas ficam).

-- 1. O cadastro -------------------------------------------------------------

create table if not exists public.maquininhas (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  nome               text not null check (length(btrim(nome)) between 1 and 60),
  ordem              integer not null default 0,
  taxas              jsonb not null default '{}'::jsonb,
  max_vezes          smallint check (max_vezes between 1 and 12),
  prazo_dias         smallint not null default 30 check (prazo_dias between 1 and 120),
  cobra_por_bandeira boolean not null default false,
  por_bandeira       jsonb not null default '{}'::jsonb,
  arquivada_em       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists maquininhas_da_rede on public.maquininhas (tenant_id, ordem, created_at);

comment on table public.maquininhas is
  'As maquininhas de cartão da rede (C75): as taxas, até quantas vezes, o prazo e a regra por bandeira de cada uma.';

alter table public.maquininhas enable row level security;

-- Configuração: a sessão não lê nem grava (sem política); o servidor lê e
-- grava pelo cliente de serviço. As restritivas do suporte valem para toda
-- tabela nova (20261008000010).
create policy suporte_sem_escrita_ins on public.maquininhas as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.maquininhas as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.maquininhas as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

alter table public.tenants
  add column if not exists pix_taxa_pct numeric(6,3) not null default 0 check (pix_taxa_pct >= 0);

alter table public.financial_transactions
  add column if not exists maquininha_id uuid references public.maquininhas(id) on delete set null;

create index if not exists financial_transactions_maquininha on public.financial_transactions (maquininha_id)
  where maquininha_id is not null;

-- 2. O espelho do que existe (migração + transição) ---------------------------

create or replace function private.maquininha_espelha_o_antigo(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primeira uuid;
begin
  select m.id into v_primeira from public.maquininhas m
   where m.tenant_id = p_tenant order by m.created_at, m.id limit 1;
  if v_primeira is null then
    insert into public.maquininhas (tenant_id, nome) values (p_tenant, 'Maquininha')
    returning id into v_primeira;
  end if;
  update public.maquininhas m
     set taxas = coalesce((
           select jsonb_object_agg(f.metodo || ':' || f.parcelas, coalesce(f.taxa_pct_sem_teto, f.taxa_pct))
             from public.payment_fees f
            where f.tenant_id = p_tenant and f.metodo in ('DEBIT_CARD', 'CREDIT_CARD')), '{}'::jsonb),
         max_vezes          = t.cartao_max_vezes,
         prazo_dias         = coalesce(t.cartao_prazo_dias, 30),
         por_bandeira       = coalesce(t.cartao_por_bandeira, '{}'::jsonb),
         cobra_por_bandeira = coalesce(t.cartao_por_bandeira, '{}'::jsonb) <> '{}'::jsonb,
         updated_at         = now()
    from public.tenants t
   where t.id = p_tenant and m.id = v_primeira;
  update public.tenants t
     set pix_taxa_pct = coalesce((
           select coalesce(f.taxa_pct_sem_teto, f.taxa_pct) from public.payment_fees f
            where f.tenant_id = p_tenant and f.metodo = 'PIX' order by f.parcelas limit 1), 0)
   where t.id = p_tenant;
end
$$;

revoke execute on function private.maquininha_espelha_o_antigo(uuid) from public, anon, authenticated;

do $$
declare
  v_t uuid;
begin
  for v_t in select t.id from public.tenants t loop
    perform private.maquininha_espelha_o_antigo(v_t);
  end loop;
end
$$;

create or replace function private.maquininha_espelha_taxas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.maquininha_espelha_o_antigo(coalesce(new.tenant_id, old.tenant_id));
  return null;
end
$$;

create or replace function private.maquininha_espelha_rede()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.maquininha_espelha_o_antigo(new.id);
  return null;
end
$$;

revoke execute on function private.maquininha_espelha_taxas() from public, anon, authenticated;
revoke execute on function private.maquininha_espelha_rede() from public, anon, authenticated;

drop trigger if exists trg_maquininha_espelha_taxas on public.payment_fees;
create trigger trg_maquininha_espelha_taxas
  after insert or update or delete on public.payment_fees
  for each row execute function private.maquininha_espelha_taxas();

drop trigger if exists trg_maquininha_espelha_rede on public.tenants;
create trigger trg_maquininha_espelha_rede
  after insert or update of cartao_max_vezes, cartao_prazo_dias, cartao_por_bandeira on public.tenants
  for each row execute function private.maquininha_espelha_rede();

-- 3. A taxa, o prazo e a maquininha da venda ---------------------------------

-- A maquininha que vale para LER: a do lançamento (se é da rede), senão a
-- primeira cadastrada — a da migração, que tem a configuração de antes.
create or replace function private.maquininha_da_venda(p_tenant uuid, p_maquininha uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.id from public.maquininhas m where m.id = p_maquininha and m.tenant_id = p_tenant),
    (select m.id from public.maquininhas m where m.tenant_id = p_tenant order by m.created_at, m.id limit 1))
$$;

-- A taxa cadastrada (ou nula): no Pix, a do campo próprio; no cartão, a da
-- bandeira dentro da maquininha (com a opção aberta), senão a da maquininha
-- daquelas vezes EXATAS (F16-2: nunca a de outras vezes).
create or replace function private.taxa_da_maquininha(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text, p_maquininha uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_metodo = 'PIX' then (select t.pix_taxa_pct from public.tenants t where t.id = p_tenant)
    when p_metodo in ('DEBIT_CARD', 'CREDIT_CARD') then (
      select coalesce(
               case when m.cobra_por_bandeira and p_bandeira is not null
                         and jsonb_typeof(m.por_bandeira -> upper(p_bandeira) -> 'taxas' -> k.chave) = 'number'
                    then (m.por_bandeira -> upper(p_bandeira) -> 'taxas' ->> k.chave)::numeric end,
               case when jsonb_typeof(m.taxas -> k.chave) = 'number' then (m.taxas ->> k.chave)::numeric end)
        from public.maquininhas m
        cross join (select p_metodo || ':' || case when p_metodo = 'DEBIT_CARD' then 1
                                                  else greatest(1, least(12, coalesce(p_parcelas, 1))) end as chave) k
       where m.id = private.maquininha_da_venda(p_tenant, p_maquininha))
  end
$$;

-- As assinaturas de antes leem a maquininha padrão.
create or replace function private.taxa_da_maquininha(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
returns numeric language sql stable security definer set search_path = ''
as $$ select private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, p_bandeira, null::uuid) $$;

create or replace function private.taxa_geral_exata(p_tenant uuid, p_metodo text, p_parcelas integer)
returns numeric language sql stable security definer set search_path = ''
as $$ select private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, null::text, null::uuid) $$;

create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text, p_maquininha uuid)
returns numeric language sql stable security definer set search_path = ''
as $$ select coalesce(private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, p_bandeira, p_maquininha), 0) $$;

create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
returns numeric language sql stable security definer set search_path = ''
as $$ select coalesce(private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, p_bandeira, null::uuid), 0) $$;

create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer)
returns numeric language sql stable security definer set search_path = ''
as $$ select coalesce(private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, null::text, null::uuid), 0) $$;

-- O prazo: o da bandeira dentro da maquininha (com a opção aberta), senão o dela.
create or replace function private.prazo_da_operadora(p_tenant uuid, p_bandeira text, p_maquininha uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when m.cobra_por_bandeira and p_bandeira is not null
                      and jsonb_typeof(m.por_bandeira -> upper(p_bandeira) -> 'prazo') = 'number'
                 then (m.por_bandeira -> upper(p_bandeira) ->> 'prazo')::int
                 else m.prazo_dias::int end
       from public.maquininhas m where m.id = private.maquininha_da_venda(p_tenant, p_maquininha)),
    30)
$$;

create or replace function private.prazo_da_operadora(p_tenant uuid, p_bandeira text)
returns integer language sql stable security definer set search_path = ''
as $$ select private.prazo_da_operadora(p_tenant, p_bandeira, null::uuid) $$;

-- 4. A maquininha do lançamento ----------------------------------------------

create or replace function private.maquininha_do_lancamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  if new.payment_method is null or new.payment_method::text not in ('DEBIT_CARD', 'CREDIT_CARD') then
    new.maquininha_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.maquininha_id is not null and new.maquininha_id is not distinct from old.maquininha_id then
    return new;
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
  if new.maquininha_id is not null then
    if not exists (select 1 from public.maquininhas m where m.id = new.maquininha_id and m.tenant_id = v_tenant) then
      raise exception 'Esta maquininha não é desta clínica.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- O estorno herda a maquininha do pagamento estornado.
  if new.estorno_de is not null then
    select f.maquininha_id into new.maquininha_id from public.financial_transactions f where f.id = new.estorno_de;
  end if;
  -- Sem escolha (a rede com uma só, o caminho que não pergunta): a primeira ativa.
  if new.maquininha_id is null then
    select m.id into new.maquininha_id from public.maquininhas m
     where m.tenant_id = v_tenant and m.arquivada_em is null
     order by m.ordem, m.created_at, m.id limit 1;
  end if;
  return new;
end
$$;

revoke execute on function private.maquininha_do_lancamento() from public, anon, authenticated;

drop trigger if exists trg_maquininha_do_lancamento on public.financial_transactions;
create trigger trg_maquininha_do_lancamento
  before insert or update of payment_method, maquininha_id on public.financial_transactions
  for each row execute function private.maquininha_do_lancamento();

-- A comissão e o recebível acompanham a troca da maquininha, como a da bandeira.
drop trigger if exists trg_comissoes_do_pagamento on public.financial_transactions;
create trigger trg_comissoes_do_pagamento
  after insert or update of is_paid, notes, amount, payment_method, loyalty_discount, sale_discount, cartao_bandeira, maquininha_id
  on public.financial_transactions
  for each row execute function private.comissoes_do_pagamento();

drop trigger if exists trg_recebiveis_do_cartao on public.financial_transactions;
create trigger trg_recebiveis_do_cartao
  after insert or update of is_paid, amount, notes, cartao_bandeira, maquininha_id
  on public.financial_transactions
  for each row execute function private.recebiveis_do_cartao_acompanham();

-- 5. Quem lê a taxa passa a maquininha do lançamento -------------------------

do $$
declare
  v_def  text;
  v_novo text;
begin
  -- O recebível da operadora: o prazo e a taxa da maquininha da venda.
  select pg_get_functiondef('private.recebiveis_do_cartao_acompanham()'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, 'new.cartao_bandeira)', ''))) / length('new.cartao_bandeira)') <> 4 then
    raise exception 'C75: recebiveis_do_cartao_acompanham não é o esperado';
  end if;
  v_novo := replace(v_def, 'new.cartao_bandeira)', 'new.cartao_bandeira, new.maquininha_id)');
  v_novo := replace(v_novo,
    'if tg_op = ''UPDATE'' and new.cartao_bandeira is distinct from old.cartao_bandeira',
    'if tg_op = ''UPDATE'' and (new.cartao_bandeira is distinct from old.cartao_bandeira or new.maquininha_id is distinct from old.maquininha_id)');
  if position('new.maquininha_id is distinct from old.maquininha_id' in v_novo) = 0 then
    raise exception 'C75: a troca da bandeira em recebiveis_do_cartao_acompanham não é a esperada';
  end if;
  execute v_novo;

  -- A conta da comissão (o avulso e as vendas).
  select pg_get_functiondef('private.comissao_conta_detalhe(uuid)'::regprocedure) into v_def;
  v_novo := replace(v_def, E'  v_bandeira  text;\n', E'  v_bandeira  text;\n  v_maquininha uuid;\n');
  v_novo := replace(v_novo,
    E'           coalesce(f.cartao_vezes, f.parcela_total),\n           f.cartao_bandeira\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira',
    E'           coalesce(f.cartao_vezes, f.parcela_total),\n           f.cartao_bandeira,\n           f.maquininha_id\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira, v_maquininha');
  v_novo := replace(v_novo,
    'comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1), v_bandeira)',
    'comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1), v_bandeira, v_maquininha)');
  v_novo := replace(v_novo, 'f.id), 1), f.cartao_bandeira)', 'f.id), 1), f.cartao_bandeira, f.maquininha_id)');
  if position('v_maquininha uuid;' in v_novo) = 0 or position('v_bandeira, v_maquininha)' in v_novo) = 0
     or position(', v_bandeira, v_maquininha' in v_novo) = 0 or position('f.cartao_bandeira, f.maquininha_id)' in v_novo) = 0 then
    raise exception 'C75: comissao_conta_detalhe não é o esperado';
  end if;
  execute v_novo;

  -- O caixa, a taxa dos lançamentos e os custos da venda.
  select pg_get_functiondef('public.metrics_caixa_dos_lancamentos(uuid, uuid[])'::regprocedure) into v_def;
  v_novo := replace(replace(v_def,
    't.parcela_total, 1), t.cartao_bandeira)', 't.parcela_total, 1), t.cartao_bandeira, t.maquininha_id)'),
    'o.parcela_total, 1), o.cartao_bandeira)', 'o.parcela_total, 1), o.cartao_bandeira, o.maquininha_id)');
  if position('t.cartao_bandeira, t.maquininha_id)' in v_novo) = 0 or position('o.cartao_bandeira, o.maquininha_id)' in v_novo) = 0 then
    raise exception 'C75: metrics_caixa_dos_lancamentos não é o esperado';
  end if;
  execute v_novo;

  select pg_get_functiondef('public.metrics_taxa_dos_lancamentos(uuid, uuid[])'::regprocedure) into v_def;
  v_novo := replace(v_def, 't.parcela_total, 1), t.cartao_bandeira)', 't.parcela_total, 1), t.cartao_bandeira, t.maquininha_id)');
  if v_novo = v_def then raise exception 'C75: metrics_taxa_dos_lancamentos não é o esperado'; end if;
  execute v_novo;

  select pg_get_functiondef('public.metrics_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, uuid)'::regprocedure) into v_def;
  v_novo := replace(v_def, 'r.parcela_total, 1), r.cartao_bandeira)', 'r.parcela_total, 1), r.cartao_bandeira, r.maquininha_id)');
  if v_novo = v_def then raise exception 'C75: metrics_custos_da_venda não é o esperado'; end if;
  execute v_novo;

  select pg_get_functiondef('public.metrics_series_dos_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, text, uuid)'::regprocedure) into v_def;
  v_novo := replace(v_def, 'r.parcela_total, 1), r.cartao_bandeira)', 'r.parcela_total, 1), r.cartao_bandeira, r.maquininha_id)');
  if v_novo = v_def then raise exception 'C75: metrics_series_dos_custos_da_venda não é o esperado'; end if;
  execute v_novo;

  -- A estimativa e o aviso do Fechamento do dia.
  select pg_get_functiondef('public.metrics_avisos_do_fechamento(uuid, uuid, timestamptz, timestamptz, timestamptz)'::regprocedure) into v_def;
  v_novo := replace(v_def, 'r.cartao_bandeira as bandeira,', 'r.cartao_bandeira as bandeira, r.maquininha_id as maquininha,');
  v_novo := replace(v_novo, 'comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira)', 'comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha)');
  if position('r.maquininha_id as maquininha' in v_novo) = 0 or position('r.bandeira, r.maquininha)' in v_novo) = 0 then
    raise exception 'C75: metrics_avisos_do_fechamento não é o esperado';
  end if;
  execute v_novo;

  select pg_get_functiondef('public.metrics_vendas_sem_taxa_do_fechamento(uuid, uuid, timestamptz, timestamptz)'::regprocedure) into v_def;
  v_novo := replace(v_def, 'r.cartao_bandeira as bandeira,', 'r.cartao_bandeira as bandeira, r.maquininha_id as maquininha,');
  v_novo := replace(v_novo, 'taxa_da_maquininha(p_tenant, x.metodo, x.vezes, x.bandeira)', 'taxa_da_maquininha(p_tenant, x.metodo, x.vezes, x.bandeira, x.maquininha)');
  if position('r.maquininha_id as maquininha' in v_novo) = 0 or position('x.bandeira, x.maquininha)' in v_novo) = 0 then
    raise exception 'C75: metrics_vendas_sem_taxa_do_fechamento não é o esperado';
  end if;
  execute v_novo;
end
$$;

-- 6. Quem grava o pagamento grava a maquininha escolhida ----------------------

do $$
declare
  v_def  text;
  v_novo text;
  v_f    text;
  v_x    text;
  v_fs   text[] := array[
    'public.plano_checkout(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid)',
    'public.pacote_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric)',
    'public.procedimento_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, integer, jsonb, jsonb)',
    'public.produto_vender_itens(uuid, uuid, uuid, uuid, uuid, jsonb, numeric, jsonb)'];
  v_xs   text[] := array['v_j', 'v_l', 'v_l', 'v_l.j'];
  i      int;
begin
  -- As vendas com os lançamentos em JSON: a maquininha vai em `maquininha_id`.
  for i in 1 .. array_length(v_fs, 1) loop
    v_f := v_fs[i];
    v_x := v_xs[i];
    select pg_get_functiondef(v_f::regprocedure) into v_def;
    if (length(v_def) - length(replace(v_def, 'cartao_vezes, cartao_bandeira,', ''))) / length('cartao_vezes, cartao_bandeira,') <> 1 then
      raise exception 'C75: a lista de colunas de % não é a esperada', v_f;
    end if;
    v_novo := replace(v_def, 'cartao_vezes, cartao_bandeira,', 'cartao_vezes, cartao_bandeira, maquininha_id,');
    v_novo := replace(v_novo,
      format('private.bandeira_do_cartao(%1$s ->> ''payment_method'', %1$s ->> ''cartao_bandeira''),', v_x),
      format(E'private.bandeira_do_cartao(%1$s ->> ''payment_method'', %1$s ->> ''cartao_bandeira''),\n      nullif(%1$s ->> ''maquininha_id'', '''')::uuid,', v_x));
    if position(format('nullif(%s ->> ''maquininha_id'', '''')::uuid,', v_x) in v_novo) = 0 then
      raise exception 'C75: os valores de % não são os esperados', v_f;
    end if;
    execute v_novo;
  end loop;

  -- O avulso (o pagamento do atendimento): `maquininha_id` nos dados.
  select pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure) into v_def;
  v_novo := replace(v_def, E'           cartao_bandeira  = v_bandeira,\n',
    E'           cartao_bandeira  = v_bandeira,\n           maquininha_id    = nullif(p_dados ->> ''maquininha_id'', '''')::uuid,\n');
  v_novo := replace(v_novo, 'payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by',
    'payment_method, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, created_by');
  v_novo := replace(v_novo, 'v_bandeira, true, v_agora,', 'v_bandeira, nullif(p_dados ->> ''maquininha_id'', '''')::uuid, true, v_agora,');
  if position('maquininha_id    = nullif' in v_novo) = 0 or position('cartao_bandeira, maquininha_id, is_paid' in v_novo) = 0
     or position('v_bandeira, nullif(p_dados ->> ''maquininha_id''' in v_novo) = 0 then
    raise exception 'C75: confirmar_pagamento_do_atendimento não é o esperado';
  end if;
  execute v_novo;

  -- O plano no check-in (`plano_receber`) não muda: o app grava a bandeira e
  -- a maquininha do que foi pago logo depois, e os gatilhos refazem a taxa.

  -- O crédito na clínica vendido: a assinatura nova com a maquininha; a de
  -- antes passa a chamá-la sem maquininha (a do código antes do deploy).
  select pg_get_functiondef('public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric)'::regprocedure) into v_def;
  v_novo := replace(v_def, 'p_ator_nome text, p_bonus numeric)', 'p_ator_nome text, p_bonus numeric, p_maquininha uuid)');
  v_novo := replace(v_novo, 'payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id',
    'payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id, maquininha_id');
  v_novo := replace(v_novo, E'coalesce(p_ator::text, ''sistema''), v_venda\n  );',
    E'coalesce(p_ator::text, ''sistema''), v_venda, p_maquininha\n  );');
  if position('p_bonus numeric, p_maquininha uuid)' in v_novo) = 0 or position('credito_vendido_id, maquininha_id' in v_novo) = 0
     or position('v_venda, p_maquininha' in v_novo) = 0 then
    raise exception 'C75: credito_vender não é o esperado';
  end if;
  execute v_novo;
end
$$;

revoke execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric, uuid) to service_role;

create or replace function public.credito_vender(
  p_tenant uuid, p_cliente uuid, p_unidade uuid, p_valor numeric, p_metodo text, p_vezes integer,
  p_bandeira text, p_ator uuid, p_ator_nome text, p_bonus numeric
) returns uuid
language sql
security definer
set search_path = public
as $$
  select public.credito_vender(p_tenant, p_cliente, p_unidade, p_valor, p_metodo, p_vezes, p_bandeira, p_ator, p_ator_nome, p_bonus, null::uuid)
$$;

-- 7. O Fechamento do dia por maquininha ---------------------------------------

create or replace function public.metrics_fechamento_por_maquininha(p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table(forma text, maquininha_id uuid, maquininha text, bandeira text, entradas numeric, saidas numeric, lancamentos integer)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select case
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           private.maquininha_da_venda(p_tenant, r.maquininha_id) as maq,
           r.cartao_bandeira as bandeira,
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
    union all
    select case
             when f.payment_method = 'CREDIT_CARD' and coalesce(f.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || f.cartao_vezes
             else f.payment_method::text
           end,
           private.maquininha_da_venda(p_tenant, f.maquininha_id),
           f.cartao_bandeira,
           case when f.estorno_de is null then 0::numeric else -f.amount end,
           case when f.estorno_de is null then f.amount else 0::numeric end
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0 and f.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
  )
  select t.forma, t.maq, m.nome, t.bandeira, round(sum(t.entrada), 2), round(sum(t.saida), 2), count(*)::integer
    from t
    left join public.maquininhas m on m.id = t.maq
   group by t.forma, t.maq, m.nome, t.bandeira
   order by t.forma, m.nome nulls last, t.bandeira nulls last
$$;

revoke execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
