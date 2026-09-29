-- Comissões, fase 2: a comissão de VALOR FIXO continua caindo na proporção de
-- pontos e voucher quando eles saem da base (modo "quando o cliente paga", ou
-- "sobre o valor pago") — era assim antes da reforma, e a fidelidade prova.
-- Taxa e insumos são custo sobre a receita: só mexem no percentual.

create or replace function private.comissao_alvo(p_linha uuid)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_metodo    text;
  v_total     numeric;
  v_recebido  numeric;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return 0;
  end if;

  if v_l.origem = 'AVULSO' then
    -- O pagamento do atendimento (um lançamento por atendimento, UNIQUE).
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text
      into v_pago, v_estornado, v_desconto, v_metodo
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, 1);
    else
      v_desconto := 0;
    end if;
    -- Modo PAGAMENTO: só vale pago. Modo ATENDIMENTO: vale desde a conclusão,
    -- e o estorno do pagamento a desfaz.
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- Pontos e voucher saem da base no modo PAGAMENTO sempre; no ATENDIMENTO,
    -- só se a rede escolheu "sobre o valor pago".
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' then
    select coalesce(sum(p.price), 0) into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    -- O que o plano recebeu de verdade: receita paga, sem estorno.
    select coalesce(sum(f.amount), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce((select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_taxa
      from public.financial_transactions f
     where f.treatment_plan_id = v_l.treatment_plan_id
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    if v_l.modo = 'PAGAMENTO' then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    end if;

  else
    -- Pacote: pago na venda (o sistema não registra quanto nem como).
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  return round(v_valor * v_fracao, 2);
end $$;

revoke execute on function private.comissao_alvo(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
