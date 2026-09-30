-- Cada parcela é um lançamento (pedido do Heitor, 2026-09-30).
--
-- Um pagamento parcelado virava UM lançamento com o saldo inteiro e o
-- vencimento da 1ª parcela; as parcelas moravam em `installments`, que nenhuma
-- tela do financeiro lia. O "Pagar" quitava o saldo de uma vez (as parcelas
-- ficavam em aberto para sempre), e a lista e o "a receber" contavam o saldo
-- inteiro no mês da venda.
--
-- Agora cada parcela é uma linha de `financial_transactions`, com o vencimento
-- dela, "— parcela 2/3" na descrição e as colunas `parcela_*` (o grupo liga as
-- parcelas de um mesmo parcelamento). Pagar, estornar, comissão, fidelidade e
-- métricas já operam por lançamento: passam a valer por parcela sem mais nada.
-- `installments` fica como histórico (nada novo é escrito lá).

-- ─── 1. As colunas ───────────────────────────────────────────────────────────
alter table public.financial_transactions
  add column if not exists parcela_numero int,
  add column if not exists parcela_total  int,
  add column if not exists parcela_grupo  uuid;

alter table public.financial_transactions drop constraint if exists financial_transactions_parcela_coerente;
alter table public.financial_transactions add constraint financial_transactions_parcela_coerente check (
  (parcela_numero is null and parcela_total is null)
  or (parcela_total between 1 and 48 and parcela_numero between 1 and parcela_total)
);

comment on column public.financial_transactions.parcela_grupo is
  'Liga as parcelas de um mesmo parcelamento (e só elas). Cada parcela é um lançamento, com o seu vencimento.';

-- A DATA do lançamento no financeiro, numa definição só: o que foi pago conta
-- pelo dia do pagamento; o que está em aberto, pelo vencimento (ou pela
-- criação, se não tem vencimento). É por ela que a lista, o "a receber" e o
-- gráfico recortam o período — a parcela de novembro aparece em novembro.
alter table public.financial_transactions
  add column if not exists data_de_referencia timestamptz generated always as (
    case when is_paid then coalesce(paid_at, created_at) else coalesce(due_date, created_at) end
  ) stored;

create index if not exists financial_transactions_referencia
  on public.financial_transactions (branch_id, data_de_referencia);
create index if not exists financial_transactions_parcela_grupo
  on public.financial_transactions (parcela_grupo) where parcela_grupo is not null;

-- ─── 2. Os parcelamentos em aberto de antes viram lançamentos por parcela ────
-- Só o que está em aberto e confere (as parcelas em aberto somam o saldo). A
-- linha de antes vira a primeira parcela em aberto; as outras nascem ao lado.
-- O que já foi pago não muda (é histórico).
do $$
declare
  v       record;
  v_i     record;
  v_grupo uuid;
  v_prim  int;
begin
  for v in
    select f.* from public.financial_transactions f
     where not f.is_paid and f.amount > 0 and f.parcela_total is null
       and coalesce(f.notes, '') <> 'Estornada'
       and exists (select 1 from public.installments i where i.transaction_id = f.id and not coalesce(i.is_paid, false))
  loop
    if (select coalesce(sum(i.amount), 0) from public.installments i
         where i.transaction_id = v.id and not coalesce(i.is_paid, false)) <> v.amount then
      continue;
    end if;
    v_grupo := gen_random_uuid();
    select min(i.number) into v_prim from public.installments i where i.transaction_id = v.id and not coalesce(i.is_paid, false);
    for v_i in
      select * from public.installments i where i.transaction_id = v.id and not coalesce(i.is_paid, false) order by i.number
    loop
      if v_i.number = v_prim then
        update public.financial_transactions
           set amount = v_i.amount, due_date = v_i.due_date,
               parcela_numero = v_i.number, parcela_total = v_i.total, parcela_grupo = v_grupo,
               description = v.description || ' — parcela ' || v_i.number || '/' || v_i.total,
               updated_at = now()
         where id = v.id;
      else
        insert into public.financial_transactions
          (branch_id, client_id, treatment_plan_id, client_package_id, procedure_sale_id, type, category,
           description, amount, payment_method, is_paid, due_date, notes, created_by,
           parcela_numero, parcela_total, parcela_grupo)
        values (
          v.branch_id, v.client_id, v.treatment_plan_id, v.client_package_id, v.procedure_sale_id, v.type, v.category,
          v.description || ' — parcela ' || v_i.number || '/' || v_i.total, v_i.amount, v.payment_method, false,
          v_i.due_date, v.notes, v.created_by,
          v_i.number, v_i.total, v_grupo
        );
      end if;
    end loop;
  end loop;
end $$;

-- 2b. Os que não fechavam por arredondamento: o checkout do plano de antes
-- dividia sem jogar a sobra na última parcela (3 × 66,67 = 200,01 para um
-- saldo de 200). O saldo é o valor verdadeiro; a última parcela absorve a
-- diferença (até um centavo por parcela).
do $$
declare
  v       record;
  v_i     record;
  v_grupo uuid;
  v_prim  int;
  v_ult   int;
  v_soma  numeric;
  v_valor numeric;
begin
  for v in
    select f.* from public.financial_transactions f
     where not f.is_paid and f.amount > 0 and f.parcela_total is null
       and coalesce(f.notes, '') <> 'Estornada'
       and exists (select 1 from public.installments i where i.transaction_id = f.id and not coalesce(i.is_paid, false))
  loop
    select coalesce(sum(i.amount), 0), min(i.number), max(i.number)
      into v_soma, v_prim, v_ult
      from public.installments i where i.transaction_id = v.id and not coalesce(i.is_paid, false);
    if abs(v_soma - v.amount) > 0.01 * (select count(*) from public.installments i where i.transaction_id = v.id and not coalesce(i.is_paid, false)) then
      continue;
    end if;
    v_grupo := gen_random_uuid();
    for v_i in
      select * from public.installments i where i.transaction_id = v.id and not coalesce(i.is_paid, false) order by i.number
    loop
      v_valor := case when v_i.number = v_ult then v_i.amount - (v_soma - v.amount) else v_i.amount end;
      if v_i.number = v_prim then
        update public.financial_transactions
           set amount = v_valor, due_date = v_i.due_date,
               parcela_numero = v_i.number, parcela_total = v_i.total, parcela_grupo = v_grupo,
               description = v.description || ' — parcela ' || v_i.number || '/' || v_i.total,
               updated_at = now()
         where id = v.id;
      else
        insert into public.financial_transactions
          (branch_id, client_id, treatment_plan_id, client_package_id, procedure_sale_id, type, category,
           description, amount, payment_method, is_paid, due_date, notes, created_by,
           parcela_numero, parcela_total, parcela_grupo)
        values (
          v.branch_id, v.client_id, v.treatment_plan_id, v.client_package_id, v.procedure_sale_id, v.type, v.category,
          v.description || ' — parcela ' || v_i.number || '/' || v_i.total, v_valor, v.payment_method, false,
          v_i.due_date, v.notes, v.created_by,
          v_i.number, v_i.total, v_grupo
        );
      end if;
    end loop;
  end loop;
end $$;

-- ─── 3. As vendas gravam a parcela ───────────────────────────────────────────
-- Cada lançamento do JSON pode trazer `sufixo` ("entrada", "parcela 2/3"),
-- `parcela_numero`, `parcela_total` e `parcela_grupo`. O `parcelas` de antes
-- (que gerava `installments`) continua aceito — é o que o código antigo manda
-- durante o deploy.
do $$
declare
  v_def  text;
  v_novo text;
  v_fn   text;
begin
  foreach v_fn in array array[
    'public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric)',
    'public.procedimento_vender(uuid, uuid, uuid, uuid, uuid, int, numeric, int, jsonb, jsonb)'
  ] loop
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_novo := replace(v_def,
$a$       is_paid, paid_at, due_date, notes, created_by)$a$,
$b$       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo)$b$);
    v_novo := replace(v_novo,
$a$'Pacote — ' || v_pac.name,$a$,
$b$'Pacote — ' || v_pac.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),$b$);
    v_novo := replace(v_novo,
$a$'Procedimento pré-pago — ' || p_quantidade || '× ' || v_proc.name,$a$,
$b$'Procedimento pré-pago — ' || p_quantidade || '× ' || v_proc.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),$b$);
    v_novo := replace(v_novo,
$a$      coalesce(p_ator::text, 'sistema')
    ) returning id into v_tx;$a$,
$b$      coalesce(p_ator::text, 'sistema'),
      nullif(v_l ->> 'parcela_numero', '')::int,
      nullif(v_l ->> 'parcela_total', '')::int,
      nullif(v_l ->> 'parcela_grupo', '')::uuid
    ) returning id into v_tx;$b$);
    if v_novo not like '%parcela_grupo%' or v_novo not like '%sufixo%' then
      raise exception '%: o trecho esperado não bateu', v_fn;
    end if;
    execute v_novo;
  end loop;
end $$;

-- ─── 4. A taxa da maquininha na comissão: as parcelas do próprio lançamento ──
do $$
declare
  v_def  text := pg_get_functiondef('private.comissao_alvo(uuid)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    'coalesce((select max(i.total) from public.installments i where i.transaction_id = f.id), 1)',
    'coalesce(f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)');
  if v_novo = v_def then
    raise exception 'comissao_alvo: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

-- ─── 5. "A receber" do período: pelo vencimento, não pela criação ────────────
-- Contava o saldo parcelado inteiro no mês da venda (created_at) — e ele sumia
-- do "a receber" no mês seguinte, ainda em aberto.
do $$
declare
  v_def  text := pg_get_functiondef('public.metrics_core'::regproc);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$not t.is_paid
                 and t.created_at between p_from and p_to$a$,
$b$not t.is_paid
                 and t.data_de_referencia between p_from and p_to$b$);
  if v_novo = v_def then
    raise exception 'metrics_core: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
