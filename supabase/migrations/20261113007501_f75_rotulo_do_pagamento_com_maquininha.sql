-- F75 (A18 da 14ª simulação): a maquininha em todo rótulo de pagamento de
-- cartão, quando a rede tem mais de uma. O histórico do atendimento dizia
-- "Pagamento confirmado via Débito" — sem a bandeira e sem dizer se foi na
-- Stone ou no Mercado Pago, e quem estornava não sabia de qual maquininha.
--
-- `private.rotulo_do_pagamento` é o espelho, no banco, de `rotuloDaForma`
-- (lib/financeiro/formas.ts) com a bandeira e a maquininha: "Débito Visa ·
-- Stone", "Crédito Mastercard 3x · Mercado Pago". A maquininha só com mais
-- de uma na rede (as arquivadas contam: o pagamento antigo foi nelas).
-- Aditiva: a função nova e o texto do histórico (só o que se grava daqui
-- para a frente).

create or replace function private.rotulo_do_pagamento(
  p_tenant uuid, p_metodo text, p_vezes integer, p_bandeira text, p_maquininha uuid
) returns text
language sql
stable
set search_path to ''
as $$
  select case when p_metodo is null then null else
    coalesce(case p_metodo
      when 'CASH'            then 'Dinheiro'
      when 'PIX'             then 'Pix'
      when 'DEBIT_CARD'      then 'Débito'
      when 'CREDIT_CARD'     then 'Crédito'
      when 'INTERNAL_CREDIT' then 'Crédito interno'
      when 'BOLETO'          then 'Boleto'
    end, p_metodo)
    || case when p_metodo in ('CREDIT_CARD', 'DEBIT_CARD') and p_bandeira is not null then ' ' || coalesce(case p_bandeira
         when 'VISA' then 'Visa' when 'MASTERCARD' then 'Mastercard' when 'ELO' then 'Elo'
         when 'AMEX' then 'Amex' when 'HIPERCARD' then 'Hipercard' when 'OUTRAS' then 'Outras'
       end, p_bandeira) else '' end
    || case when p_metodo = 'CREDIT_CARD' and coalesce(p_vezes, 1) > 1 then ' ' || p_vezes || 'x' else '' end
    || case when p_metodo in ('CREDIT_CARD', 'DEBIT_CARD') and p_maquininha is not null
              and (select count(*) from public.maquininhas m where m.tenant_id = p_tenant) > 1
         then coalesce(' · ' || (select m.nome from public.maquininhas m where m.id = p_maquininha and m.tenant_id = p_tenant), '')
         else '' end
  end
$$;

revoke execute on function private.rotulo_do_pagamento(uuid, text, integer, text, uuid) from public, anon, authenticated;

-- O histórico do pagamento confirmado passa a usar o rótulo com a bandeira e a
-- maquininha (a do lançamento gravado: a escolhida, ou a que o banco pôs).
do $$
declare
  d text;
  antigo constant text := $x$coalesce(' via ' || private.rotulo_da_forma(v_metodo, v_vezes), '')$x$;
  novo   constant text := $x$coalesce(' via ' || private.rotulo_do_pagamento(p_tenant, v_metodo, v_vezes, v_bandeira, (select f.maquininha_id from public.financial_transactions f where f.id = v_tx)), '')$x$;
begin
  d := pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  if position(antigo in d) = 0 then
    raise exception 'confirmar_pagamento_do_atendimento: o trecho do histórico mudou; refazer esta migration';
  end if;
  execute replace(d, antigo, novo);
end
$$;

notify pgrst, 'reload schema';
