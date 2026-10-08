-- A dívida de estoque da revisão do Copilot (2026-10-08): os três caminhos que
-- ainda gravavam o saldo ABSOLUTO calculado no app sobre um saldo lido antes —
-- duas saídas ao mesmo tempo perdiam uma.
--
-- 1. A TRANSFERÊNCIA vira função (`estoque_transferir`): as duas linhas de
--    saldo travadas, na mesma ordem, e a conta lá dentro (como
--    `estoque_entrada` e `estoque_ajuste`, 20261008000005/06).
-- 2. A CONCLUSÃO do atendimento e a ENTREGA do produto de voucher continuam
--    com o cálculo no app (`lib/estoque/baixa.ts`: uma cópia só da conta do
--    rendimento e das embalagens), mas o app manda o saldo que LEU
--    (`antes_embalagens`, `antes_rendimento`) e o banco trava a linha e
--    confere: mudou → PT409 (409 Conflict), nada gravado, e o app relê e tenta de novo
--    (`lib/estoque/nova-tentativa.ts`). Sem os campos (o deploy de antes),
--    grava como antes.

-- ─── A conferência do saldo lido ─────────────────────────────────────────────
create or replace function private.estoque_conferir_lido(p_produto uuid, p_unidade uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emb  numeric;
  v_rend numeric;
begin
  if p_dados is null or not (p_dados ? 'antes_embalagens') then return; end if;
  -- Sem linha de saldo, o app leu 0: a linha nasce para ser travada.
  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  select current_stock, current_rendimento into v_emb, v_rend
    from public.branch_product_stock
   where product_id = p_produto and branch_id = p_unidade
     for update;
  if v_emb is distinct from (p_dados ->> 'antes_embalagens')::numeric
     or v_rend is distinct from nullif(p_dados ->> 'antes_rendimento', '')::numeric then
    -- PT409, não 40001: o PostgREST REPETE a chamada sozinho em 40001
    -- (serialization_failure), e a repetição cega não relê o saldo.
    raise exception 'O estoque mudou enquanto a baixa era calculada. Tente de novo.' using errcode = 'PT409';
  end if;
end $$;

revoke execute on function private.estoque_conferir_lido(uuid, uuid, jsonb) from public, anon, authenticated;

-- ─── 1. A transferência ──────────────────────────────────────────────────────
create or replace function public.estoque_transferir(
  p_produto uuid, p_origem uuid, p_destino uuid, p_quantidade numeric, p_observacao text, p_autor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upp       numeric;
  v_de        numeric;
  v_de_rend   numeric;
  v_para      numeric;
  v_para_rend numeric;
  v_ref       text;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.' using errcode = 'P0001';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser filiais diferentes.' using errcode = 'P0001';
  end if;

  select case when nullif(units_per_package, 0) is not null and nullif(consumption_unit, '') is not null then units_per_package end
    into v_upp from public.products where id = p_produto;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_origem, 0, 0), (p_produto, p_destino, 0, 0)
  on conflict (product_id, branch_id) do nothing;
  -- As duas travadas na MESMA ordem (pela unidade): duas transferências em
  -- sentidos opostos não se esperam em ciclo.
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

  -- Liga a saída à entrada — e é por ela que o gatilho leva os lotes da
  -- origem para o destino.
  v_ref := 'TRANSFER-' || gen_random_uuid();
  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, notes, reference, created_by)
  values
    (p_origem,  p_produto, 'TRANSFER_OUT', -p_quantidade, v_de - p_quantidade,
     case when p_observacao is null or p_observacao = '' then 'Transferência para filial destino.' else 'Transferência → destino. ' || p_observacao end,
     v_ref, p_autor),
    (p_destino, p_produto, 'TRANSFER_IN',   p_quantidade, v_para + p_quantidade,
     case when p_observacao is null or p_observacao = '' then 'Transferência da filial de origem.' else 'Transferência ← origem. ' || p_observacao end,
     v_ref, p_autor);

  -- Rendimento: vão embalagens inteiras (sempre cheias).
  update public.branch_product_stock
     set current_stock = v_de - p_quantidade,
         current_rendimento = case when v_upp is not null
           then greatest(0, coalesce(v_de_rend, v_de * v_upp) - p_quantidade * v_upp) end,
         updated_at = now()
   where product_id = p_produto and branch_id = p_origem;
  update public.branch_product_stock
     set current_stock = v_para + p_quantidade,
         current_rendimento = case when v_upp is not null
           then coalesce(v_para_rend, v_para * v_upp) + p_quantidade * v_upp end,
         updated_at = now()
   where product_id = p_produto and branch_id = p_destino;

  return jsonb_build_object('origem', v_de - p_quantidade, 'destino', v_para + p_quantidade);
end $$;

revoke execute on function public.estoque_transferir(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.estoque_transferir(uuid, uuid, uuid, numeric, text, text) to service_role;

-- ─── 2. A conclusão confere o saldo lido de cada insumo ──────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('public.concluir_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, appointment_id, created_by, unit_cost)$a$,
$b$    -- O saldo é o que o app leu ao calcular? (PT409 se não: ele relê e tenta de novo.)
    perform private.estoque_conferir_lido((v_insumo ->> 'produto')::uuid, v_unidade, v_insumo);
    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, appointment_id, created_by, unit_cost)$b$);
  if v_novo not like '%private.estoque_conferir_lido%' then
    raise exception 'concluir_atendimento: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

-- ─── 3. A entrega do produto do voucher também ───────────────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('public.entregar_voucher_produto(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, created_by, unit_cost, reference, notes)$a$,
$b$  perform private.estoque_conferir_lido(v_v.product_id, p_unidade, p_dados);
  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, created_by, unit_cost, reference, notes)$b$);
  if v_novo not like '%private.estoque_conferir_lido%' then
    raise exception 'entregar_voucher_produto: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
