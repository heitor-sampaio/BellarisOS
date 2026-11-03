-- r2-fin-01 (F13; o Heitor, 2026-11-03: "como a operadora paga de verdade e
-- configurável o prazo"). A parcela que a OPERADORA deposita do cartão em N
-- vezes deixa de vencer "no mesmo dia de cada mês" e passa a vencer a cada N
-- dias corridos contados da venda — a parcela k em venda + k × N dias. O N é
-- da clínica (`tenants.cartao_prazo_dias`, 30 por padrão, 1–120), em
-- Configurações → Comissões, junto das taxas da maquininha. O vencimento é
-- retratado na parcela quando ela nasce: mudar o prazo vale para as próximas
-- vendas.
--
-- A troca é sobre o corpo ATUAL do gatilho (o helper das 20261101000703/704).

alter table public.tenants
  add column if not exists cartao_prazo_dias smallint not null default 30
    check (cartao_prazo_dias between 1 and 120);

comment on column public.tenants.cartao_prazo_dias is
  'r2-fin-01: a cada quantos dias corridos (da venda) a operadora deposita cada parcela do cartão em N vezes.';

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

select pg_temp.trocar_no_corpo('private.recebiveis_do_cartao_acompanham()'::regprocedure,
  array[
    E'  k          int;\n',
    'select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;',
    'make_interval(months => k)'
  ],
  array[
    E'  k          int;\n  v_prazo    int;\n',
    E'select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;\n      -- r2-fin-01: a cada N dias corridos da venda (o prazo da clínica).\n      select coalesce(t.cartao_prazo_dias, 30) into v_prazo from public.tenants t where t.id = v_tenant;\n      v_prazo   := coalesce(v_prazo, 30);',
    'make_interval(days => k * v_prazo)'
  ],
  array[1, 1, 1]);

notify pgrst, 'reload schema';
