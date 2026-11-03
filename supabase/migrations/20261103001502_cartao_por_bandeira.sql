-- r3-f13-01 (F15; o Heitor, revisão de 2026-11-03: "Lembre-se, flexibilidade.
-- Prazo por bandeira. Taxas também configuráveis por bandeira.").
--
-- - A configuração de HOJE (`payment_fees` e `tenants.cartao_prazo_dias`) é a
--   REGRA GERAL: vale para toda bandeira sem regra própria e para o pagamento
--   sem bandeira. A clínica que não mexe não vê diferença.
-- - Cada bandeira (Visa, Mastercard, Elo, Amex, Hipercard, Outras) pode ter o
--   SEU prazo da operadora e as SUAS taxas: `tenants.cartao_por_bandeira`,
--   { "ELO": { "prazo": 32, "taxas": { "CREDIT_CARD:3": 3 } } } — o que não
--   está ali cai na regra geral. (Uma coluna da rede, não uma tabela: a chave
--   primária de `payment_fees` é (rede, forma, vezes), e trocá-la seria
--   destrutivo; o conjunto é pequeno e se grava de uma vez.)
-- - O pagamento no cartão (crédito e débito) GUARDA a bandeira, opcional:
--   `financial_transactions.cartao_bandeira`.
-- - A taxa da bandeira vale onde a taxa já vale: o líquido da comissão
--   (`comissao_conta`), o que a operadora deposita (`recebiveis_do_cartao`) e
--   a estimativa do Fechamento do dia. O prazo vale no nascimento das parcelas
--   da operadora.
-- - Informar (ou trocar) a bandeira DEPOIS de pago — o recebimento do plano no
--   check-in, a correção — refaz o prazo e a taxa das parcelas da operadora
--   enquanto nenhuma foi recebida, e a comissão se acerta pelo gatilho dela.
--
-- As funções que gravam pagamento (o recebimento do atendimento, as três
-- vendas) leem a bandeira do que já recebem (jsonb), por troca de texto sobre o
-- corpo ATUAL da produção — nenhuma assinatura muda.

-- 1) As colunas.
alter table public.tenants
  add column if not exists cartao_por_bandeira jsonb not null default '{}'::jsonb;
alter table public.tenants
  add constraint tenants_cartao_por_bandeira_objeto check (jsonb_typeof(cartao_por_bandeira) = 'object');

alter table public.financial_transactions
  add column if not exists cartao_bandeira text;
alter table public.financial_transactions
  add constraint financial_transactions_cartao_bandeira_check check (
    cartao_bandeira is null
    or (cartao_bandeira in ('VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'OUTRAS')
        and payment_method in ('CREDIT_CARD', 'DEBIT_CARD')));
comment on column public.financial_transactions.cartao_bandeira is
  'A bandeira do cartão (r3-f13-01), opcional: vazia, vale a regra geral do prazo e das taxas da maquininha.';
comment on column public.tenants.cartao_por_bandeira is
  'O prazo da operadora e as taxas da maquininha de cada bandeira (r3-f13-01): {"ELO":{"prazo":32,"taxas":{"CREDIT_CARD:3":3}}}. O que falta cai na regra geral (cartao_prazo_dias, payment_fees).';

-- 2) A bandeira que chega: nula fora do cartão ou vazia; recusada se não é uma das seis.
create or replace function private.bandeira_do_cartao(p_metodo text, p_bandeira text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v text := nullif(upper(trim(coalesce(p_bandeira, ''))), '');
begin
  if v is null or coalesce(p_metodo, '') not in ('CREDIT_CARD', 'DEBIT_CARD') then
    return null;
  end if;
  if v not in ('VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'OUTRAS') then
    raise exception 'Bandeira do cartão desconhecida (%): use Visa, Mastercard, Elo, Amex, Hipercard ou Outras.', p_bandeira
      using errcode = 'P0001';
  end if;
  return v;
end
$$;

-- 3) A taxa da bandeira: a dela (a maior faixa de vezes cadastrada até a do
--    pagamento), senão a da regra geral. A de 3 argumentos segue a geral.
create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(
    (select (e.value #>> '{}')::numeric
       from public.tenants t,
            jsonb_each(coalesce(t.cartao_por_bandeira -> upper(p_bandeira) -> 'taxas', '{}'::jsonb)) e
      where t.id = p_tenant and p_bandeira is not null
        and jsonb_typeof(e.value) = 'number'
        and split_part(e.key, ':', 1) = p_metodo
        and split_part(e.key, ':', 2) ~ '^[0-9]+$'
        and split_part(e.key, ':', 2)::int <= greatest(1, least(12, coalesce(p_parcelas, 1)))
      order by split_part(e.key, ':', 2)::int desc
      limit 1),
    private.comissao_taxa_pct(p_tenant, p_metodo, p_parcelas))
$$;

-- O prazo da bandeira, senão o da clínica, senão 30.
create or replace function private.prazo_da_operadora(p_tenant uuid, p_bandeira text)
returns int
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(
    case when jsonb_typeof(t.cartao_por_bandeira -> upper(p_bandeira) -> 'prazo') = 'number'
         then (t.cartao_por_bandeira -> upper(p_bandeira) ->> 'prazo')::int end,
    t.cartao_prazo_dias, 30)
    from public.tenants t where t.id = p_tenant
$$;

-- 4) Troca de texto sobre o corpo atual (conferindo quantas vezes cada trecho aparece).
create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- 4a) As parcelas da operadora: o prazo e a taxa da bandeira; e a bandeira
--     informada depois refaz as que a operadora ainda não pagou.
select pg_temp.trocar_no_corpo('private.recebiveis_do_cartao_acompanham()',
  array[
    E'select coalesce(t.cartao_prazo_dias, 30) into v_prazo from public.tenants t where t.id = v_tenant;',
    E'v_taxa    := private.comissao_taxa_pct(v_tenant, ''CREDIT_CARD'', v_vezes);',
    E'  -- Acompanhar: o que a operadora ainda deve não passa do que a venda vale.'
  ],
  array[
    E'-- r3-f13-01: o prazo da bandeira, senão o da clínica.\n      v_prazo := private.prazo_da_operadora(v_tenant, new.cartao_bandeira);',
    E'v_taxa    := private.comissao_taxa_pct(v_tenant, ''CREDIT_CARD'', v_vezes, new.cartao_bandeira);',
    E'  -- r3-f13-01: a bandeira informada (ou trocada) depois do pagamento refaz o\n'
    || E'  -- prazo e a taxa das parcelas, enquanto a operadora não pagou nenhuma.\n'
    || E'  if tg_op = ''UPDATE'' and new.cartao_bandeira is distinct from old.cartao_bandeira\n'
    || E'     and not exists (select 1 from public.recebiveis_do_cartao r\n'
    || E'                      where r.transaction_id = new.id\n'
    || E'                        and (r.recebida_em is not null or r.cancelada_em is not null\n'
    || E'                             or r.estornada_em is not null or r.vencimento <= now())) then\n'
    || E'    select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;\n'
    || E'    v_prazo := private.prazo_da_operadora(v_tenant, new.cartao_bandeira);\n'
    || E'    v_base  := coalesce(new.paid_at, now()) at time zone ''America/Sao_Paulo'';\n'
    || E'    v_taxa  := private.comissao_taxa_pct(v_tenant, ''CREDIT_CARD'', least(12, coalesce(new.cartao_vezes, 1)), new.cartao_bandeira);\n'
    || E'    update public.recebiveis_do_cartao r\n'
    || E'       set taxa_pct = coalesce(v_taxa, 0),\n'
    || E'           vencimento = (v_base + make_interval(days => r.parcela_numero * v_prazo)) at time zone ''America/Sao_Paulo''\n'
    || E'     where r.transaction_id = new.id;\n'
    || E'  end if;\n\n'
    || E'  -- Acompanhar: o que a operadora ainda deve não passa do que a venda vale.'
  ],
  array[1, 1, 1]);

create or replace trigger trg_recebiveis_do_cartao
  after insert or update of is_paid, amount, notes, cartao_bandeira on public.financial_transactions
  for each row execute function private.recebiveis_do_cartao_acompanham();

-- 4b) A comissão: a taxa da bandeira do pagamento.
select pg_temp.trocar_no_corpo('private.comissao_conta(uuid)',
  array[
    E'  v_vezes     int;\n',
    E'           f.cartao_vezes\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes',
    E'private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1))',
    E'coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))'
  ],
  array[
    E'  v_vezes     int;\n  v_bandeira  text;\n',
    E'           f.cartao_vezes,\n           f.cartao_bandeira\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira',
    E'private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1), v_bandeira)',
    E'coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira))'
  ],
  array[1, 1, 1, 1]);

create or replace trigger trg_comissoes_do_pagamento
  after insert or update of is_paid, notes, amount, payment_method, loyalty_discount, sale_discount, cartao_bandeira
  on public.financial_transactions
  for each row execute function private.comissoes_do_pagamento();

-- 4c) A estimativa das taxas do Fechamento do dia.
select pg_temp.trocar_no_corpo('public.metrics_avisos_do_fechamento(uuid,uuid,timestamptz,timestamptz,timestamptz)',
  array[
    E'coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes,',
    E'private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes)'
  ],
  array[
    E'coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes, r.cartao_bandeira as bandeira,',
    E'private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira)'
  ],
  array[1, 1]);

-- 4d) O recebimento do atendimento: p_dados.cartao_bandeira.
select pg_temp.trocar_no_corpo('public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)',
  array[
    E'  v_vezes     int     := coalesce(nullif(p_dados ->> ''cartao_vezes'', '''')::int, 1);\n',
    E'           cartao_vezes     = case when v_vezes > 1 then v_vezes end,\n',
    E'payment_method, cartao_vezes, is_paid, paid_at, created_by\n',
    E'      case when v_vezes > 1 then v_vezes end, true, v_agora,\n'
  ],
  array[
    E'  v_vezes     int     := coalesce(nullif(p_dados ->> ''cartao_vezes'', '''')::int, 1);\n'
    || E'  -- r3-f13-01: a bandeira do cartão, opcional.\n'
    || E'  v_bandeira  text    := private.bandeira_do_cartao(nullif(trim(coalesce(p_dados ->> ''metodo'', '''')), ''''), p_dados ->> ''cartao_bandeira'');\n',
    E'           cartao_vezes     = case when v_vezes > 1 then v_vezes end,\n           cartao_bandeira  = v_bandeira,\n',
    E'payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by\n',
    E'      case when v_vezes > 1 then v_vezes end, v_bandeira, true, v_agora,\n'
  ],
  array[1, 1, 1, 1]);

-- 4e) As três vendas (pacote, pré-pago, produto): a bandeira de cada lançamento.
select pg_temp.trocar_no_corpo(f::regprocedure,
  array[
    E'parcela_numero, parcela_total, parcela_grupo, cartao_vezes,\n',
    E'nullif(' || v || E' ->> ''cartao_vezes'', '''')::smallint,\n'
  ],
  array[
    E'parcela_numero, parcela_total, parcela_grupo, cartao_vezes, cartao_bandeira,\n',
    E'nullif(' || v || E' ->> ''cartao_vezes'', '''')::smallint,\n      private.bandeira_do_cartao(' || v || E' ->> ''payment_method'', ' || v || E' ->> ''cartao_bandeira''),\n'
  ],
  array[1, 1])
from (values
  ('public.pacote_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,numeric)', 'v_l'),
  ('public.procedimento_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)', 'v_l'),
  ('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)', 'v_l.j')
) as x(f, v);

-- 4f) O pagamento novo do usado no cancelamento do pacote: p_novo.bandeira.
select pg_temp.trocar_no_corpo('public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)',
  array[
    E'payment_method, cartao_vezes, is_paid, paid_at, created_by\n',
    E'case when v_novo_metodo = ''CREDIT_CARD'' and v_novo_vezes >= 2 then v_novo_vezes end,\n'
  ],
  array[
    E'payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by\n',
    E'case when v_novo_metodo = ''CREDIT_CARD'' and v_novo_vezes >= 2 then v_novo_vezes end,\n'
    || E'          private.bandeira_do_cartao(v_novo_metodo, p_novo ->> ''bandeira''),\n'
  ],
  array[1, 1]);

-- 4g) O contra-lançamento do estorno herda a bandeira, como a forma e as vezes.
select pg_temp.trocar_no_corpo('public.estornar_transacao(uuid,uuid,text,text)',
  array[
    E'payment_method, cartao_vezes, estorno_motivo,',
    E'v_tx.payment_method, v_tx.cartao_vezes, v_motivo,'
  ],
  array[
    E'payment_method, cartao_vezes, cartao_bandeira, estorno_motivo,',
    E'v_tx.payment_method, v_tx.cartao_vezes, v_tx.cartao_bandeira, v_motivo,'
  ],
  array[1, 1]);

notify pgrst, 'reload schema';
