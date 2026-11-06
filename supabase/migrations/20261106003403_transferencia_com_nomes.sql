-- D12 da 8ª simulação (2026-11-06): o histórico da transferência dizia
-- "Transferência → destino." e "Transferência ← origem." — as palavras como
-- estavam escritas, sem o nome da unidade. Agora a nota diz "Transferência
-- para Batel." na origem e "Transferência de Água Verde." no destino (com a
-- observação depois, quando há). As linhas de antes não são reescritas: a
-- tela as resolve pela outra perna (lib/estoque/transferencia.ts).
-- Partindo do corpo ATUAL da produção (20261027000011).

create or replace function public.estoque_transferir(p_produto uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_observacao text, p_autor text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_upp       numeric;
  v_de        numeric;
  v_de_rend   numeric;
  v_para      numeric;
  v_para_rend numeric;
  v_ref       text;
  v_nome_de   text;
  v_nome_para text;
  v_obs       text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser filiais diferentes.' using errcode = 'P0001';
  end if;

  select case when public.tem_unidade_de_consumo(p) then p.units_per_package end
    into v_upp from public.products p where p.id = p_produto;

  -- O nome de cada unidade, para a nota das duas pernas (D12 da 8ª).
  select b.name into v_nome_de   from public.branches b where b.id = p_origem;
  select b.name into v_nome_para from public.branches b where b.id = p_destino;
  v_obs := nullif(trim(coalesce(p_observacao, '')), '');

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_origem, 0, 0), (p_produto, p_destino, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  perform 1 from public.branch_product_stock
   where product_id = p_produto and branch_id in (p_origem, p_destino)
   order by branch_id
     for update;

  select current_stock, current_rendimento into v_de, v_de_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_origem;
  select current_stock, current_rendimento into v_para, v_para_rend
    from public.branch_product_stock where product_id = p_produto and branch_id = p_destino;
  v_de := coalesce(v_de, 0);
  v_para := coalesce(v_para, 0);

  if p_quantidade > v_de then
    raise exception 'Estoque insuficiente na filial de origem. Disponível: %', trim(to_char(v_de, 'FM999999990.###')) using errcode = 'P0001';
  end if;

  -- O saldo em consumo depois, dos dois lados (nulo quando o produto conta em embalagens).
  if v_upp is not null then
    v_de_rend   := greatest(0, coalesce(v_de_rend, v_de * v_upp) - p_quantidade * v_upp);
    v_para_rend := coalesce(v_para_rend, v_para * v_upp) + p_quantidade * v_upp;
  else
    v_de_rend := null; v_para_rend := null;
  end if;

  v_ref := 'TRANSFER-' || gen_random_uuid();
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, reference, created_by)
  values
    (p_origem,  p_produto, 'TRANSFER_OUT', -p_quantidade * coalesce(v_upp, 1), coalesce(v_de_rend, v_de - p_quantidade),
     concat_ws(' ', 'Transferência para ' || coalesce(v_nome_para, 'outra unidade') || '.', v_obs),
     v_ref, p_autor),
    (p_destino, p_produto, 'TRANSFER_IN',   p_quantidade * coalesce(v_upp, 1), coalesce(v_para_rend, v_para + p_quantidade),
     concat_ws(' ', 'Transferência de ' || coalesce(v_nome_de, 'outra unidade') || '.', v_obs),
     v_ref, p_autor);

  update public.branch_product_stock
     set current_stock = v_de - p_quantidade, current_rendimento = v_de_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_origem;
  update public.branch_product_stock
     set current_stock = v_para + p_quantidade, current_rendimento = v_para_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_destino;

  return jsonb_build_object('origem', v_de - p_quantidade, 'destino', v_para + p_quantidade);
end $function$;

notify pgrst, 'reload schema';
