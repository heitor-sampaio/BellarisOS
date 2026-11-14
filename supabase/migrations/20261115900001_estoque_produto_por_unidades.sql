-- Bloco Estoque (E11 e E13) e o EQ1d do bloco Equipe — plano de adaptação,
-- docs/revisao.md (o Heitor, 2026-11-13).
--
-- E13: "Quem cadastra é só quem tem permissão de gerenciar." Sai a regra
-- "catálogo só da rede × as unidades também" (C63, F66): a coluna
-- `tenants.catalogo_de_produtos` sai. DESTRUTIVA, e sem perda: nenhuma rede
-- tinha "Só a rede" (todas em 'UNIDADE', o padrão) quando ela saiu.
--
-- E11: o estoque inicial "mantem como está, mas com possibilidade de dividir a
-- entrada entre as unidades". O app calcula (o SKU, o uso e o preço, a
-- comissão, as unidades ao alcance de quem cadastra) e UMA função grava: o
-- produto e o estoque inicial de cada unidade numa transação — uma linha que
-- falha (a unidade de outra rede, a desativada, a repetida), e nada fica, nem
-- o produto. Era o produto gravado pelo app, uma unidade só no estoque inicial
-- e o produto apagado à mão se o estoque falhasse (D8 da 9ª).

-- ─── 1. A regra "Só a rede" sai (E13) ──────────────────────────────────────
alter table public.tenants drop constraint if exists tenants_catalogo_de_produtos_check;
alter table public.tenants drop column if exists catalogo_de_produtos;

-- ─── 2. O produto com o estoque inicial dividido (E11) ─────────────────────
-- p_produto: as colunas do produto (name, sku, category, category_id, unit,
--   barcode, cost_price, sale_price, uso, min_stock, consumption_unit,
--   units_per_package, comissao_tipo, comissao_valor).
-- p_linhas: [{ "unidade": uuid, "quantidade": numeric }] — pode ser vazio
--   (o produto sem estoque inicial). Cada linha é uma ENTRADA (estoque_inicial,
--   com o lote, a validade, o custo, a marca, o fornecedor e a nota iguais em
--   todas) e o mínimo do cadastro na unidade.
create or replace function public.produto_cadastrar(
  p_tenant uuid, p_produto jsonb, p_linhas jsonb,
  p_custo numeric, p_observacao text, p_lote text, p_validade timestamp with time zone,
  p_autor text, p_fornecedor text, p_nota_fiscal text, p_marca text)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_produto  uuid;
  v_linha    jsonb;
  v_unidade  uuid;
  v_qtd      numeric;
  v_ativa    boolean;
  v_vistas   uuid[] := '{}';
  v_minimo   numeric := coalesce((p_produto->>'min_stock')::numeric, 0);
begin
  if p_tenant is null then
    raise exception 'Rede não informada.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_produto->>'name', '')), '') is null then
    raise exception 'Nome é obrigatório.' using errcode = 'P0001';
  end if;

  insert into public.products (tenant_id, name, sku, category, category_id, unit, barcode, cost_price, sale_price,
                               uso, min_stock, consumption_unit, units_per_package, comissao_tipo, comissao_valor)
  values (p_tenant, btrim(p_produto->>'name'), p_produto->>'sku', p_produto->>'category',
          (p_produto->>'category_id')::uuid, p_produto->>'unit', p_produto->>'barcode',
          (p_produto->>'cost_price')::numeric, (p_produto->>'sale_price')::numeric,
          coalesce(p_produto->>'uso', 'INSUMO'), v_minimo, p_produto->>'consumption_unit',
          (p_produto->>'units_per_package')::numeric, p_produto->>'comissao_tipo',
          (p_produto->>'comissao_valor')::numeric)
  returning id into v_produto;

  for v_linha in select value from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    v_unidade := (v_linha->>'unidade')::uuid;
    v_qtd     := (v_linha->>'quantidade')::numeric;
    if v_unidade is null then
      raise exception 'Escolha a unidade que vai receber o estoque inicial.' using errcode = 'P0001';
    end if;
    if v_unidade = any(v_vistas) then
      raise exception 'Cada unidade aparece uma vez no estoque inicial.' using errcode = 'P0001';
    end if;
    v_vistas := v_vistas || v_unidade;
    select b.is_active into v_ativa from public.branches b where b.id = v_unidade and b.tenant_id = p_tenant;
    if not found then
      raise exception 'A unidade do estoque inicial não é desta rede.' using errcode = 'P0001';
    end if;
    if not v_ativa then
      raise exception 'Esta unidade foi desativada: o estoque novo vai para uma unidade ativa.' using errcode = 'P0001';
    end if;
    perform public.estoque_inicial(v_produto, v_unidade, v_qtd, p_custo, p_observacao, p_lote, p_validade,
                                   p_autor, v_minimo, p_fornecedor, p_nota_fiscal, p_marca);
  end loop;

  return v_produto;
end;
$function$;
revoke execute on function public.produto_cadastrar(uuid, jsonb, jsonb, numeric, text, text, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.produto_cadastrar(uuid, jsonb, jsonb, numeric, text, text, timestamptz, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
