-- F20 (6ª simulação, 2026-11-04) — o dinheiro do cartão.
--
-- D4: o crédito À VISTA também vira recebível da operadora. A operadora
-- deposita o 1x no prazo da bandeira (ou no da clínica), com a taxa do 1x —
-- exatamente como as N vezes: UMA parcela. Até aqui o gatilho só fazia
-- parcelas "em 2+ vezes", e os R$ 2.000 no crédito 1x da Begônia não
-- apareciam no "A receber da operadora" nem no fluxo de caixa, embora a tela
-- de taxas deixasse configurar o prazo e a taxa do 1x (princípio 3). O débito
-- e o Pix seguem recebidos no dia: não há prazo configurado para eles
-- (princípio 4, "não chutar número"). A receita continua da VENDA, no dia
-- dela (princípio 5: o caixa conta no dia em que o dinheiro entrou — a
-- cliente pagou na maquininha). As vendas no 1x de antes ficam como estão,
-- sem parcela (como as N vezes de antes da F2c).
--
-- D13: a taxa por parcela leva a sobra do arredondamento na ÚLTIMA parcela,
-- como o valor. Visa 2x de R$ 750 a 2,38% gravava 8,93 + 8,93 = R$ 17,86, e o
-- Fechamento estimava R$ 17,85 (duas telas, dois números). A taxa é coluna
-- gerada e não vê as outras parcelas: a sobra mora em `taxa_sobra` (só na
-- última, calculada pelo gatilho) e entra na taxa enquanto a parcela está
-- inteira (valor = valor_original). A parcela cancelada ou estornada fica sem
-- ela.

alter table public.recebiveis_do_cartao
  add column if not exists taxa_sobra numeric not null default 0;

comment on column public.recebiveis_do_cartao.taxa_sobra is
  'D13 (F20): a sobra do arredondamento da taxa da venda, só na última parcela — a taxa da venda é round(total × %), e as parcelas somam exatamente ela.';

alter table public.recebiveis_do_cartao
  alter column taxa set expression as (
    round(valor * taxa_pct / 100, 2) + case when valor = valor_original then taxa_sobra else 0 end);
alter table public.recebiveis_do_cartao
  alter column liquido set expression as (
    valor - (round(valor * taxa_pct / 100, 2) + case when valor = valor_original then taxa_sobra else 0 end));

-- A sobra das vendas que já existem (só onde a venda está inteira): a taxa
-- passa a fechar com a da venda.
with v as (
  select r.transaction_id, max(r.taxa_pct) taxa_pct,
         round(sum(r.valor_original) * max(r.taxa_pct) / 100, 2)
           - sum(round(r.valor_original * r.taxa_pct / 100, 2)) sobra
    from public.recebiveis_do_cartao r
   group by r.transaction_id
  having bool_and(r.valor = r.valor_original) and count(distinct r.taxa_pct) = 1
)
update public.recebiveis_do_cartao r
   set taxa_sobra = v.sobra
  from v
 where r.transaction_id = v.transaction_id and r.parcela_numero = r.parcela_total and v.sobra <> 0;

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
    -- Criar: a venda paga no crédito, à vista (D4, F20) ou em N vezes (nunca o
    -- estorno, que herda a forma e as vezes da original).
    if new.type = 'INCOME' and new.is_paid and new.payment_method = 'CREDIT_CARD'
       and new.amount > 0
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
