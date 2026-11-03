-- est-03 da revisão das decisões (2026-11-02, "mudar"): "um frasco aberto de
-- toxina vence com 30 UI sobrando; a Bruna precisa digitar '0,3 frasco'". A
-- perda aceita também a unidade de CONSUMO.
--
-- `estoque_perda_em` é a perda com a unidade dita (`p_em_consumo`): em
-- consumo, o movimento sai da quantidade digitada EXATA (30 UI), sem passar
-- por uma fração de frasco arredondada; o lote e o saldo descem o que ela vale
-- em embalagens; a recusa ("o lote tem só…", "estoque insuficiente") fala na
-- unidade escolhida. Produto sem unidade de consumo: embalagens, como sempre.
-- O resto é o corpo de `estoque_perda` da produção, que passa a chamar esta
-- (em embalagens) — uma regra só.

create or replace function public.estoque_perda_em(
  p_produto uuid, p_unidade uuid, p_lote uuid, p_quantidade numeric, p_em_consumo boolean,
  p_motivo text, p_observacao text, p_autor text
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_lote_qtd   numeric;
  v_custo      numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_l          record;
  v_consumo    boolean;
  v_emb        numeric;   -- a perda em embalagens
  v_cons       numeric;   -- a perda em consumo (com unidade de consumo)
  v_un         text;      -- a unidade das mensagens
begin
  if p_motivo is null or p_motivo not in ('VENCIDO', 'QUEBROU', 'AMOSTRA', 'USO_INTERNO') then
    raise exception 'Escolha o motivo da perda.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;

  v_upp     := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator   := public.fator_de_consumo(v_p);
  v_consumo := coalesce(p_em_consumo, false) and v_upp is not null;
  v_emb     := case when v_consumo then p_quantidade / v_upp else p_quantidade end;
  v_cons    := case when v_upp is null then null when v_consumo then p_quantidade else p_quantidade * v_upp end;
  v_un      := case when v_consumo then v_p.consumption_unit else v_p.unit end;

  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if not found then
    raise exception 'Não há estoque deste produto nesta unidade.' using errcode = 'P0001';
  end if;

  -- O lote escolhido primeiro: "o lote tem só 2" diz mais que "o estoque tem 2".
  if p_lote is not null then
    select b.quantity into v_lote_qtd
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
     for update;
    if not found then
      raise exception 'Lote não encontrado nesta unidade.' using errcode = 'P0001';
    end if;
    if v_emb > v_lote_qtd + 0.0001 then
      raise exception 'O lote tem só % %.',
        trim_scale(round(greatest(case when v_consumo then v_lote_qtd * v_upp else v_lote_qtd end, 0), 2)), v_un using errcode = 'P0001';
    end if;
  end if;

  if v_upp is not null then
    v_rend := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    if v_cons > v_rend + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(case when v_consumo then v_rend else v_rend / v_upp end, 0), 2)), v_un using errcode = 'P0001';
    end if;
    v_novo_rend := v_rend - v_cons;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    if p_quantidade > coalesce(v_saldo, 0) + 0.0001 then
      raise exception 'Estoque insuficiente: há % % nesta unidade.',
        trim_scale(round(greatest(coalesce(v_saldo, 0), 0), 2)), v_p.unit using errcode = 'P0001';
    end if;
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  if p_lote is not null then
    select m.unit_cost into v_custo
      from public.stock_movement_batches smb
      join public.stock_movements m on m.id = smb.movement_id
     where smb.batch_id = p_lote and m.type = 'PURCHASE' and m.unit_cost is not null
     limit 1;
  else
    v_falta := v_emb;
    for v_l in
      select b.id, b.quantity,
             (select m.unit_cost from public.stock_movement_batches smb
                join public.stock_movements m on m.id = smb.movement_id
               where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
        from public.product_batches b
       where b.product_id = p_produto and b.branch_id = p_unidade and b.quantity > 0
       order by coalesce(b.expires_at < current_date, false), b.expires_at nulls last, b.received_at
    loop
      exit when v_falta <= 0;
      v_tira := least(v_l.quantity, v_falta);
      if v_l.custo is not null then
        v_soma := v_soma + v_tira * v_l.custo;
        v_peso := v_peso + v_tira;
      end if;
      v_falta := v_falta - v_tira;
    end loop;
    if v_peso > 0 then v_custo := v_soma / v_peso; end if;
  end if;
  v_custo := coalesce(v_custo, public.custo_de_consumo(v_p));

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference, motivo_da_perda)
  values (
    p_unidade, p_produto, 'LOSS', -(coalesce(v_cons, p_quantidade * v_fator)), coalesce(v_novo_rend, v_novas), v_custo,
    nullif(btrim(coalesce(p_observacao, '')), ''), coalesce(p_autor, 'sistema'),
    case when p_lote is not null then 'lote:' || p_lote end, p_motivo
  );

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  return v_novas;
end $$;

revoke execute on function public.estoque_perda_em(uuid, uuid, uuid, numeric, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.estoque_perda_em(uuid, uuid, uuid, numeric, boolean, text, text, text) to service_role;

-- A perda em embalagens de antes é a mesma regra.
create or replace function public.estoque_perda(
  p_produto uuid, p_unidade uuid, p_lote uuid, p_quantidade numeric, p_motivo text, p_observacao text, p_autor text
) returns numeric
language sql
security definer
set search_path = ''
as $$
  select public.estoque_perda_em(p_produto, p_unidade, p_lote, p_quantidade, false, p_motivo, p_observacao, p_autor)
$$;

notify pgrst, 'reload schema';
