-- F20 — o crédito 1x ESPERA (D4), a sobra da taxa fica (D13).
--
-- A 20261104002001 levou o gatilho a fazer a parcela do crédito 1x, mas a
-- tabela tem a restrição `recebiveis_do_cartao_check` (parcela_total de 2 a
-- 12), e toda venda no crédito 1x passou a ser RECUSADA pelo banco ("violates
-- check constraint"). Trocar a restrição é `alter table … drop constraint`,
-- que pede confirmação humana no Supabase: o gatilho volta a fazer só as 2+
-- vezes até lá (aplicado à mão minutos depois da 2001, e gravado aqui), e a
-- sobra da taxa na última parcela (D13) continua valendo. O SQL do 1x está
-- no branch f20-d4-credito-1x.

create or replace function private.recebiveis_do_cartao_acompanham()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tenant   uuid;
  v_vezes    int;
  v_base     timestamp;
  v_parcela  numeric;
  v_ultima   numeric;
  v_taxa     numeric;
  v_sobra_tx numeric;
  v_alvo     numeric;
  v_vivo     numeric;
  v_sobra    numeric;
  v_corte    numeric;
  v_total    numeric;
  v_soma_tx  numeric;
  v_r        record;
  k          int;
  v_prazo    int;
begin
  -- r2-fin-03: no cartão, o estorno é do pagamento inteiro; o já pago não diminui.
  if tg_op = 'UPDATE' and old.is_paid and new.is_paid and new.amount < old.amount
     and coalesce(new.notes, '') <> 'Estornada' and coalesce(new.category, '') <> 'Estorno'
     and new.type = 'INCOME' and new.payment_method in ('CREDIT_CARD', 'DEBIT_CARD') then
    raise exception 'No cartão, o estorno é do pagamento inteiro: estorne o pagamento inteiro e lance o usado de novo.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.recebiveis_do_cartao r where r.transaction_id = new.id) then
    -- Criar: a venda paga no crédito em 2+ vezes (nunca o estorno, que herda
    -- a forma e as vezes da original). O 1x (D4, F20) espera a restrição
    -- recebiveis_do_cartao_check aceitar parcela_total = 1.
    if new.type = 'INCOME' and new.is_paid and new.payment_method = 'CREDIT_CARD'
       and coalesce(new.cartao_vezes, 1) >= 2 and new.amount > 0
       and coalesce(new.category, '') <> 'Estorno' and coalesce(new.notes, '') <> 'Estornada'
       and (tg_op = 'INSERT' or not old.is_paid) then
      select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
      -- r2-fin-01: a cada N dias corridos da venda (o prazo da clínica).
      -- r3-f13-01: o prazo da bandeira, senão o da clínica.
      v_prazo := private.prazo_da_operadora(v_tenant, new.cartao_bandeira);
      v_prazo   := coalesce(v_prazo, 30);
      v_vezes   := greatest(1, least(12, coalesce(new.cartao_vezes, 1)));
      v_base    := coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo';
      v_parcela := trunc(new.amount * 100 / v_vezes) / 100;
      v_ultima  := new.amount - v_parcela * (v_vezes - 1);
      v_taxa    := coalesce(private.comissao_taxa_pct(v_tenant, 'CREDIT_CARD', v_vezes, new.cartao_bandeira), 0);
      -- D13: a taxa da venda é round(total × %); a última parcela leva a sobra.
      v_sobra_tx := round(new.amount * v_taxa / 100, 2)
                    - (round(v_parcela * v_taxa / 100, 2) * (v_vezes - 1) + round(v_ultima * v_taxa / 100, 2));
      for k in 1..v_vezes loop
        insert into public.recebiveis_do_cartao (
          tenant_id, branch_id, transaction_id, parcela_numero, parcela_total,
          valor, valor_original, taxa_pct, taxa_sobra, vencimento
        ) values (
          v_tenant, new.branch_id, new.id, k, v_vezes,
          case when k = v_vezes then v_ultima else v_parcela end,
          case when k = v_vezes then v_ultima else v_parcela end,
          v_taxa,
          case when k = v_vezes then v_sobra_tx else 0 end,
          (v_base + make_interval(days => k * v_prazo)) at time zone 'America/Sao_Paulo'
        );
      end loop;
    end if;
    return new;
  end if;

  -- r3-f13-01: a bandeira informada (ou trocada) depois do pagamento refaz o
  -- prazo e a taxa das parcelas, enquanto a operadora não pagou nenhuma.
  if tg_op = 'UPDATE' and new.cartao_bandeira is distinct from old.cartao_bandeira
     and not exists (select 1 from public.recebiveis_do_cartao r
                      where r.transaction_id = new.id
                        and (r.recebida_em is not null or r.cancelada_em is not null
                             or r.estornada_em is not null or r.vencimento <= now())) then
    select b.tenant_id into v_tenant from public.branches b where b.id = new.branch_id;
    v_prazo := private.prazo_da_operadora(v_tenant, new.cartao_bandeira);
    v_base  := coalesce(new.paid_at, now()) at time zone 'America/Sao_Paulo';
    v_taxa  := coalesce(private.comissao_taxa_pct(v_tenant, 'CREDIT_CARD', least(12, coalesce(new.cartao_vezes, 1)), new.cartao_bandeira), 0);
    select sum(r.valor_original), sum(round(r.valor_original * v_taxa / 100, 2)) into v_total, v_soma_tx
      from public.recebiveis_do_cartao r where r.transaction_id = new.id;
    update public.recebiveis_do_cartao r
       set taxa_pct = v_taxa,
           taxa_sobra = case when r.parcela_numero = r.parcela_total
                             then round(v_total * v_taxa / 100, 2) - v_soma_tx else 0 end,
           vencimento = (v_base + make_interval(days => r.parcela_numero * v_prazo)) at time zone 'America/Sao_Paulo'
     where r.transaction_id = new.id;
  end if;

  -- Acompanhar: o que a operadora ainda deve não passa do que a venda vale.
  v_alvo := case when coalesce(new.notes, '') = 'Estornada' or not new.is_paid then 0 else greatest(new.amount, 0) end;
  select coalesce(sum(r.valor), 0) into v_vivo
    from public.recebiveis_do_cartao r
   where r.transaction_id = new.id and r.cancelada_em is null and r.estornada_em is null;
  v_sobra := round(v_vivo - v_alvo, 2);
  if v_sobra <= 0 then
    return new;
  end if;

  -- Cai primeiro o que ainda não foi recebido, do mais novo para o mais antigo;
  -- depois, o já recebido é estornado (a operadora toma de volta).
  for v_r in
    select r.id, r.valor, (r.recebida_em is not null or r.vencimento <= now()) as recebida
      from public.recebiveis_do_cartao r
     where r.transaction_id = new.id and r.cancelada_em is null and r.estornada_em is null and r.valor > 0
     order by (r.recebida_em is not null or r.vencimento <= now()), r.parcela_numero desc
     for update
  loop
    exit when v_sobra <= 0;
    v_corte := least(v_sobra, v_r.valor);
    if v_r.recebida then
      update public.recebiveis_do_cartao
         set valor = valor - v_corte, estornado = estornado + v_corte,
             estornada_em = case when valor - v_corte = 0 then now() end
       where id = v_r.id;
    else
      update public.recebiveis_do_cartao
         set valor = valor - v_corte,
             cancelada_em = case when valor - v_corte = 0 then now() end
       where id = v_r.id;
    end if;
    v_sobra := round(v_sobra - v_corte, 2);
  end loop;
  return new;
end $function$;

notify pgrst, 'reload schema';
