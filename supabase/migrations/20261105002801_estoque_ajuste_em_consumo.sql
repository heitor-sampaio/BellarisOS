-- D3 da 7ª simulação (2026-11-05): o inventário calculava sobre o "8 un"
-- arredondado. A toxina tinha 780 UI (7,8 frascos); o Ajuste mostrava "Estoque
-- atual 8 un", a Tânia contou 7,7 e o estoque ficou em 750 UI, não em 770.
-- `estoque_ajuste` lê a contagem como embalagens com o frasco aberto contado
-- INTEIRO: tira da contagem o "já consumido do frasco aberto" (8 × 100 − 780
-- = 20) — 7,7 × 100 − 20 = 750. Sumiram 20 UI (R$ 180), sem a tela dizer.
--
-- `estoque_ajuste_em` (decidido pelo princípio 3: o que a tela mostra é o que
-- vale): a contagem vale EXATA, na unidade em que foi digitada.
-- - `p_em_consumo` (o produto com unidade de consumo): a contagem é o
--   rendimento — 765 UI são 765 UI;
-- - em embalagens: a fração é o frasco aberto — 7,7 frascos são 770 UI.
-- O saldo em embalagens é o rendimento arredondado para cima (o aberto conta
-- inteiro, como na baixa e na perda: `estoque_perda_em`). O produto sem
-- unidade de consumo segue em embalagens, como sempre. Uma transação, a linha
-- do saldo travada; o movimento é o que o rendimento andou (em consumo).
-- `estoque_ajuste` (o de antes) fica, sem chamador no app.

create or replace function public.estoque_ajuste_em(
  p_produto uuid, p_unidade uuid, p_contagem numeric, p_em_consumo boolean, p_motivo text, p_autor text
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_rend_antes numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
begin
  if p_contagem is null or p_contagem < 0 then
    raise exception 'Novo estoque não pode ser negativo.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;

  if v_upp is not null then
    v_rend_antes := coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp);
    v_novo_rend  := case when coalesce(p_em_consumo, false) then p_contagem else p_contagem * v_upp end;
    v_novas      := ceil(round(v_novo_rend / v_upp, 6));
  else
    v_novas      := p_contagem;
  end if;

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, created_by)
  values (p_unidade, p_produto, 'MANUAL_ADJUSTMENT',
          case when v_upp is not null then v_novo_rend - v_rend_antes else p_contagem - coalesce(v_saldo, 0) end,
          coalesce(v_novo_rend, v_novas), trim(p_motivo), p_autor);

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  -- O saldo de antes, na unidade da contagem (para o "de … para …").
  return case when v_upp is not null then
           case when coalesce(p_em_consumo, false) then v_rend_antes else round(v_rend_antes / v_upp, 4) end
         else coalesce(v_saldo, 0) end;
end $$;

revoke execute on function public.estoque_ajuste_em(uuid, uuid, numeric, boolean, text, text) from public, anon, authenticated;
grant execute on function public.estoque_ajuste_em(uuid, uuid, numeric, boolean, text, text) to service_role;

notify pgrst, 'reload schema';
