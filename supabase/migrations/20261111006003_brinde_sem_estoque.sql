-- A7 da 12ª simulação (2026-11-11): a recompensa "Produto / brinde" sem estoque.
--
-- Aplicada na produção em 2026-11-11 pela sessão principal (o drop da check
-- relaxa a regra, não apaga dado), depois da F60.
--
-- A Helena quis "Máscara de LED cortesia" — um brinde que não é produto do
-- estoque —, e a recompensa exigia um produto: virou "Máscara facial
-- calmante". Princípio 1 (a clínica decide): a recompensa PRODUTO aceita um
-- brinde ou serviço só com o nome (sem produto), e a entrega só marca o voucher
-- como usado, sem mexer no estoque.
alter table public.loyalty_rewards drop constraint loyalty_rewards_por_tipo;
alter table public.loyalty_rewards add constraint loyalty_rewards_por_tipo check (
  (type = 'PROCEDIMENTO' and procedure_id is not null and product_id is null and discount_value is null) or
  -- A7 da 12ª: o brinde pode não ter produto (texto livre, sem estoque).
  (type = 'PRODUTO' and procedure_id is null and discount_value is null) or
  (type = 'DESCONTO_VALOR' and discount_value > 0 and procedure_id is null and product_id is null) or
  (type = 'DESCONTO_PERCENTUAL' and discount_value > 0 and discount_value <= 100 and procedure_id is null and product_id is null)
);

-- Corpo de partida: o da produção em 2026-11-11.
create or replace function public.entregar_voucher_produto(p_tenant uuid, p_voucher uuid, p_unidade uuid, p_ator text, p_dados jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_v   public.loyalty_vouchers%rowtype;
  v_cfg public.loyalty_configs%rowtype;
  v_mov uuid;
begin
  select * into v_v from public.loyalty_vouchers v where v.id = p_voucher for update;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Voucher não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_v.type <> 'PRODUTO' then
    raise exception 'Este voucher não é de produto: ele é usado no pagamento.' using errcode = 'P0001';
  end if;
  if v_v.status <> 'ATIVO' then
    raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
  end if;
  if v_v.expires_at <= now() then
    raise exception 'Voucher vencido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant;
  if coalesce(v_cfg.scope_per_branch, false) and v_v.branch_id <> p_unidade then
    raise exception 'Este voucher é da outra unidade.' using errcode = 'P0001';
  end if;

  -- A7 da 12ª: o brinde sem produto (texto livre) não mexe no estoque.
  if v_v.product_id is null then
    update public.loyalty_vouchers set status = 'USADO', used_at = now() where id = p_voucher;
    return;
  end if;

  perform private.estoque_conferir_lido(v_v.product_id, p_unidade, p_dados);
  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, created_by, unit_cost, reference, notes)
  values (
    p_unidade, v_v.product_id, 'MANUAL_ADJUSTMENT',
    (p_dados ->> 'quantidade')::numeric,
    (p_dados ->> 'saldo_apos')::numeric,
    coalesce(p_ator, 'sistema'),
    (select public.custo_de_consumo(p) from public.products p where p.id = v_v.product_id),
    'voucher:' || v_v.id,
    'Entrega de recompensa: ' || v_v.name
  )
  returning id into v_mov;

  insert into public.branch_product_stock
    (product_id, branch_id, current_stock, current_rendimento, min_stock, updated_at)
  values (
    v_v.product_id, p_unidade,
    (p_dados ->> 'embalagens')::numeric,
    (p_dados ->> 'rendimento')::numeric,
    coalesce((p_dados ->> 'minimo')::numeric, 0),
    now()
  )
  on conflict (product_id, branch_id) do update
    set current_stock      = excluded.current_stock,
        current_rendimento = excluded.current_rendimento,
        updated_at         = excluded.updated_at;

  update public.loyalty_vouchers
     set status = 'USADO', used_at = now(), used_stock_movement_id = v_mov
   where id = p_voucher;
end;
$function$;

notify pgrst, 'reload schema';
