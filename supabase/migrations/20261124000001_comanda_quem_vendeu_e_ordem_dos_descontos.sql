-- Auditoria das regras (2026-11-18), agente C — a comanda do atendimento.
--
-- Item 1a — quem vendeu os produtos da comanda (com-06, o Heitor: "às vezes
-- quem vai registrar a venda é recepção e quem vendeu foi a profissional (...)
-- Campo vazio não gera comissão para ninguém"; r2-ven-12: "nasce sempre
-- vazio"). O produto acrescentado na comanda do atendimento saía com "quem
-- vendeu = quem atendeu" (`v_prof`). Agora é quem a tela escolheu em "Quem
-- vendeu os produtos" (`p_dados.vendedor_dos_produtos`, conferido na action
-- por `quemVendeu`): vazio, ninguém — sem comissão de venda.
--
-- Item 5 — a ordem dos descontos (o Heitor, 2026-11-18: "Desconto, voucher,
-- pontos"): no avulso era voucher → desconto comercial → pontos; a Nova venda
-- e o plano já eram desconto → voucher → pontos. Agora o desconto comercial
-- vale sobre o total da comanda, o voucher sobre o que sobrou (o de % e o de
-- R$ sobre o total menos o desconto; o de procedimento, o que sobra do
-- atendimento depois da parte dele no desconto) e os pontos sobre o resto. O
-- rateio entre o atendimento e os produtos segue a mesma ordem. A conta do app
-- é `voucherDepoisDoDesconto` (lib/fidelidade/voucher-na-comanda.ts).
--
-- A função é a viva (a de 20261121000001): trocam-se só os trechos, e a
-- migration falha se algum não for encontrado (nada se desfaz calado).

do $migracao$
declare
  v_def   text := pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_troca text[][] := array[
    -- 1a: quem vendeu os produtos é o da tela.
    array[
$a$    select u.id into v_vendedor from public.users u
     where u.id = v_prof and u.tenant_id = p_tenant and coalesce(u.is_active, true);$a$,
$b$    -- Quem vendeu os produtos: o escolhido na tela (com-06: vazio, ninguém).
    select u.id into v_vendedor from public.users u
     where u.id = nullif(p_dados ->> 'vendedor_dos_produtos', '')::uuid and u.tenant_id = p_tenant and coalesce(u.is_active, true);$b$],
    -- 5: o desconto comercial antes do voucher.
    array[
$a$  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;$a$,
$b$  -- "Desconto, voucher, pontos" (o Heitor, 2026-11-18): o desconto comercial vem primeiro.
  if v_dvenda > v_total then
    raise exception 'O desconto não pode ser maior que o total da comanda.' using errcode = 'P0001';
  end if;
  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;$b$],
    array[
$a$        case when v_voucher.procedure_id = v_proc then v_falta else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_total)
      when 'DESCONTO_PERCENTUAL' then round(v_total * v_voucher.discount_value / 100, 2)$a$,
$b$        case when v_voucher.procedure_id = v_proc
             then v_falta - (v_dvenda - private.parte_dos_itens(v_dvenda, v_falta, v_itens)) else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_total - v_dvenda)
      when 'DESCONTO_PERCENTUAL' then round((v_total - v_dvenda) * v_voucher.discount_value / 100, 2)$b$],
    array[
$a$    v_dv_it := case when v_vid is not null and v_voucher.type = 'PROCEDIMENTO' then 0
                    else private.parte_dos_itens(v_dv, v_rem_at, v_rem_it) end;
    v_rem_at := v_rem_at - (v_dv - v_dv_it);
    v_rem_it := v_rem_it - v_dv_it;
    v_dvenda_it := private.parte_dos_itens(v_dvenda, v_rem_at, v_rem_it);
    v_rem_at := v_rem_at - (v_dvenda - v_dvenda_it);
    v_rem_it := v_rem_it - v_dvenda_it;$a$,
$b$    v_dvenda_it := private.parte_dos_itens(v_dvenda, v_rem_at, v_rem_it);
    v_rem_at := v_rem_at - (v_dvenda - v_dvenda_it);
    v_rem_it := v_rem_it - v_dvenda_it;
    v_dv_it := case when v_vid is not null and v_voucher.type = 'PROCEDIMENTO' then 0
                    else private.parte_dos_itens(v_dv, v_rem_at, v_rem_it) end;
    v_rem_at := v_rem_at - (v_dv - v_dv_it);
    v_rem_it := v_rem_it - v_dv_it;$b$]
  ];
  i int;
begin
  for i in 1 .. array_length(v_troca, 1) loop
    if position(v_troca[i][1] in v_def) = 0 then
      raise exception 'confirmar_pagamento_do_atendimento: o trecho % não está na função viva.', i;
    end if;
    v_def := replace(v_def, v_troca[i][1], v_troca[i][2]);
  end loop;
  execute v_def;
end $migracao$;

revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
