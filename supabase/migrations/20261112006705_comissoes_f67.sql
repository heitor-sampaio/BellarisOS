-- F67 (o levantamento das regras, 2026-11-12), as comissões.
--
-- C40 (D13): a regra do item vence mesmo com 0%. `pacote_vender_com_equipe`
-- só usava a "De venda" do pacote com `valor > 0`; com 0%, caía na regra de
-- venda da pessoa — a tela do Vender (comissao-da-venda.ts) já dizia "0% do
-- pacote". Agora o pacote com a regra própria, mesmo 0%, não cai na da pessoa.
--
-- C41: a taxa da maquininha do AVULSO lia só `cartao_vezes`; o lançamento em
-- várias vezes gravado com `parcela_total` (sem `cartao_vezes`) pagava a taxa
-- do 1x. Agora o avulso lê como o resto da conta: cartao_vezes, senão
-- parcela_total.

do $$
declare
  v_def text;
  v_novo text;
begin
  -- C40
  select pg_get_functiondef('public.pacote_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric)'::regprocedure)
    into v_def;
  v_novo := replace(v_def,
    'if p_vendedor is not null and v_pac.comissao_venda_tipo is not null and coalesce(v_pac.comissao_venda_valor, 0) > 0 then',
    E'if p_vendedor is not null and v_pac.comissao_venda_tipo is not null and v_pac.comissao_venda_valor is not null then\n    -- C40: a regra do pacote vence mesmo com 0% (com 0%, nenhuma linha).\n    if v_pac.comissao_venda_valor > 0 then');
  v_novo := replace(v_novo,
    E'''PRECO'', v_vendido, 0, v_cp, ''ITEM'');\n  elsif',
    E'''PRECO'', v_vendido, 0, v_cp, ''ITEM'');\n    end if;\n  elsif');
  if v_novo = v_def or position('v_pac.comissao_venda_valor > 0 then' in v_novo) = 0
     or position(E'''ITEM'');\n    end if;\n  elsif' in v_novo) = 0 then
    raise exception 'C40: o corpo de pacote_vender_com_equipe não é o esperado';
  end if;
  execute v_novo;

  -- C41
  select pg_get_functiondef('private.comissao_conta_detalhe(uuid)'::regprocedure) into v_def;
  v_novo := replace(v_def,
    E'           f.cartao_vezes,\n           f.cartao_bandeira\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira',
    E'           coalesce(f.cartao_vezes, f.parcela_total),\n           f.cartao_bandeira\n      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira');
  if v_novo = v_def then
    raise exception 'C41: o corpo de comissao_conta_detalhe não é o esperado';
  end if;
  execute v_novo;
end
$$;

notify pgrst, 'reload schema';
