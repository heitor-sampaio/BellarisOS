-- F7 (achado da F2b, 2026-11-02): o pagamento com CRÉDITO INTERNO não é
-- receita de novo. O dinheiro entrou quando a cliente pagou (o Pix do pacote
-- cancelado fica), e o crédito é o saldo dela na clínica (`internal_credits`).
-- Usar o crédito num atendimento grava um INCOME pago com
-- payment_method = 'INTERNAL_CREDIT' — e a fonte única (metrics_receitas_pagas)
-- e as contas que repetem o predicado dela o somavam: R$ 600 para R$ 300.
--
-- Cada função é recriada a partir do corpo ATUAL da produção
-- (pg_get_functiondef), trocando só o trecho do predicado; o trecho tem de
-- aparecer o número de vezes esperado, ou a migration para.

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

select pg_temp.trocar_no_corpo(
  'public.metrics_receitas_pagas(uuid,uuid[],timestamptz,timestamptz,uuid)',
  array[E'    and t.type = ''INCOME'' and t.is_paid\n'],
  array[E'    and t.type = ''INCOME'' and t.is_paid\n    and t.payment_method is distinct from ''INTERNAL_CREDIT''\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid)',
  array[E'               where t.type = ''INCOME'' and t.is_paid\n'],
  array[E'               where t.type = ''INCOME'' and t.is_paid\n                 and t.payment_method is distinct from ''INTERNAL_CREDIT''\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_by_branch(uuid,timestamptz,timestamptz)',
  array[E'               where t.branch_id = b.id and t.type = ''INCOME'' and t.is_paid\n'],
  array[E'               where t.branch_id = b.id and t.type = ''INCOME'' and t.is_paid\n                 and t.payment_method is distinct from ''INTERNAL_CREDIT''\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
  array[E'    where t.is_paid\n'],
  array[E'    where t.is_paid\n      and not (t.type = ''INCOME'' and t.payment_method is not distinct from ''INTERNAL_CREDIT'')\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_top_clients(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[E'    where t.type = ''INCOME'' and t.is_paid and t.client_id is not null\n'],
  array[E'    where t.type = ''INCOME'' and t.is_paid and t.client_id is not null\n      and t.payment_method is distinct from ''INTERNAL_CREDIT''\n'],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.metrics_financeiro_composicao(uuid,uuid[],timestamptz,timestamptz)',
  array[E'       and f.is_paid\n'],
  array[E'       and f.is_paid\n       and not (f.type = ''INCOME'' and f.payment_method is not distinct from ''INTERNAL_CREDIT'')\n'],
  array[1]);

notify pgrst, 'reload schema';
