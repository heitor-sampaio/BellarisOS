-- r2-ven-10 (F13; o Heitor, 2026-11-03: "deixar a clínica decidir,
-- flexibilidade"). A comissão da venda de produto pode ser:
--   TOTAL       — uma regra só, sobre o total (como era: commission_configs.produto_pct);
--   POR_PRODUTO — cada produto com o seu percentual ou valor (por unidade
--                 vendida), e o produto sem regra própria cai na regra geral
--                 (produto_pct). No kit, cada item comissiona pela sua regra,
--                 sobre a parte dele no vendido (o desconto rateado pela
--                 tabela; a última parte leva o arredondamento).
-- A clínica escolhe em Configurações → Comissões (commission_configs.produto_modo);
-- a regra de cada produto mora no próprio produto (products.comissao_tipo,
-- products.comissao_valor) e só o servidor grava.
--
-- produto_vender_itens: só o passo 4 (a comissão) muda, por troca de texto
-- sobre o corpo ATUAL da produção. As linhas por item usam a mesma conta de
-- sempre (private.comissao_conta: a venda paga inteira, o estorno devolve).

alter table public.commission_configs
  add column if not exists produto_modo text not null default 'TOTAL'
    check (produto_modo in ('TOTAL', 'POR_PRODUTO'));

alter table public.products
  add column if not exists comissao_tipo  text check (comissao_tipo in ('PERCENTAGE', 'FIXED_AMOUNT')),
  add column if not exists comissao_valor numeric check (comissao_valor is null or comissao_valor >= 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_comissao_completa') then
    alter table public.products add constraint products_comissao_completa
      check ((comissao_tipo is null) = (comissao_valor is null));
  end if;
end $$;

comment on column public.commission_configs.produto_modo is
  'r2-ven-10: TOTAL (uma regra sobre o total, produto_pct) ou POR_PRODUTO (a de cada produto; sem ela, produto_pct).';
comment on column public.products.comissao_tipo is
  'r2-ven-10: a comissão de venda deste produto quando a clínica comissiona por produto (PERCENTAGE do vendido, ou FIXED_AMOUNT por unidade).';

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

select pg_temp.trocar_no_corpo('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure,
  array[
    E'  v_itens      jsonb;\n',
    E'  -- 4. A comissão da venda (uma, sobre o total), para QUEM VENDEU.\n  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;\n  if p_vendedor is not null and coalesce(v_cfg.produto_pct, 0) > 0 then'
  ],
  array[
    E'  v_itens      jsonb;\n  v_ci         record;\n  v_parte      numeric;\n  v_parte_soma numeric := 0;\n  v_rtipo      text;\n  v_rvalor     numeric;\n',
    E'  -- 4. A comissão da venda, para QUEM VENDEU (r2-ven-10): uma regra sobre o\n  -- total, ou POR PRODUTO — cada item pela sua regra (sem a dele, a geral),\n  -- sobre a parte dele no vendido.\n  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;\n  if p_vendedor is not null and coalesce(v_cfg.produto_modo, ''TOTAL'') = ''POR_PRODUTO'' then\n    for v_ci in\n      select i.sort_order, i.quantity, i.preco_tabela, p.comissao_tipo, p.comissao_valor,\n             count(*) over () as n, row_number() over (order by i.sort_order) as k\n        from public.product_sale_items i join public.products p on p.id = i.product_id\n       where i.sale_id = v_venda\n       order by i.sort_order\n    loop\n      v_parte := case when v_ci.k = v_ci.n then v_vendido - v_parte_soma\n                      when v_tabela > 0 then round(v_ci.preco_tabela * v_vendido / v_tabela, 2)\n                      else 0 end;\n      v_parte_soma := v_parte_soma + v_parte;\n      if v_ci.comissao_tipo is not null then\n        v_rtipo  := v_ci.comissao_tipo;\n        v_rvalor := case when v_ci.comissao_tipo = ''FIXED_AMOUNT''\n                         then round(v_ci.comissao_valor * v_ci.quantity, 2) else v_ci.comissao_valor end;\n      else\n        v_rtipo  := ''PERCENTAGE'';\n        v_rvalor := coalesce(v_cfg.produto_pct, 0);\n      end if;\n      continue when coalesce(v_rvalor, 0) <= 0;\n      insert into public.commission_lines\n        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,\n         regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)\n      values (p_tenant, p_unidade, null, v_ci.sort_order, null, p_vendedor, ''PRODUTO'',\n              v_rtipo::public."CommissionType", v_rvalor, ''INTEGRAL'', false, coalesce(v_cfg.desconta_taxa, false), ''PRECO'',\n              v_parte, 0, v_venda);\n    end loop;\n  elsif p_vendedor is not null and coalesce(v_cfg.produto_pct, 0) > 0 then'
  ],
  array[1, 1]);

notify pgrst, 'reload schema';
