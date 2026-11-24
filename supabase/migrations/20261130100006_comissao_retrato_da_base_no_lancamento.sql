-- O retrato da base em cada lançamento de comissão (26ª).
--
-- Decisão do Claude (26ª), pelo princípio 3 ("O que a tela mostra é o que vale
-- na conta"). Toda linha de comissão é INTEGRAL (`trg_comissao_linha_integral`):
-- a comissão se libera uma vez, quando a venda inteira está paga, com a conta
-- da venda inteira (a taxa média de todas as formas, os pontos e o voucher de
-- todos os pagamentos). O extrato lia essa conta HOJE: o estorno, o cancelamento
-- ou o recebimento de depois mudavam a base que a liberação de semanas atrás
-- mostrava. "A base do pagamento" (a 300004, retirada antes de subir) não
-- servia: mostrava a taxa da última parcela ao lado de um valor contado com
-- todas.
--
-- 1. `commissions.base_retrato` (jsonb): o que o extrato mostra da base —
--    preço, %, base, desconto, pontos e voucher, taxa, insumos e o fator —, de
--    `private.comissao_conta_detalhe` no instante em que o lançamento nasce
--    (a mesma conta que deu o valor dele). O ESTORNO retrata a base da
--    liberação que ele desfaz (a última liberação da linha). Vale para todo
--    tipo: avulso, pacote, plano, pré-pago e produto. Só se grava ao nascer: o
--    gatilho da Auditoria lista colunas só na edição, e o retrato nunca é
--    editado — fica fora da frase (retrato técnico).
-- 2. O extrato (e o CSV, que sai dele) usa o retrato quando existe. Sem ele (o
--    lançamento de antes desta migration, ou a linha cancelada, sem base), a
--    conta de hoje, como antes — e no avulso ligado a um pagamento, a D5 da 18ª.
-- Nada se recalcula: os lançamentos que já existem ficam sem retrato.
--
-- Partes do corpo VIVO (o padrão `pg_temp.trocar_no_corpo`), com a contagem;
-- os corpos vivos são os da 20261124900003 e da 20261112006401 (nenhuma
-- pendente mexe neles).

alter table public.commissions add column if not exists base_retrato jsonb;

comment on column public.commissions.base_retrato is
  'A base do lançamento na hora em que nasceu (26ª): preço, %, base e o que saiu dela; o estorno, a da liberação que desfaz. Nulo = o extrato usa a conta de hoje.';

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  de text;
  para text;
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    -- O arquivo pode ter vindo com CRLF; o corpo no banco, não.
    de := replace(p_de[i], chr(13), '');
    para := replace(p_para[i], chr(13), '');
    n := (length(d) - length(replace(d, de, ''))) / length(de);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, de, para);
  end loop;
  execute d;
end
$f$;

-- ─── 1. O acerto da linha grava o retrato ──────────────────────────────────
select pg_temp.trocar_no_corpo(
  'private.comissao_acertar_linha(uuid,text,uuid)'::regprocedure,
  array[
$t$  v_id      uuid;
begin
$t$,
$t$  if v_delta <> 0 then
    insert into public.commissions
$t$,
$t$       line_id, kind, motivo, released_at, transaction_id)$t$,
$t$      p_motivo, now(), p_transacao
    )$t$],
  array[
$t$  v_id      uuid;
  v_retrato jsonb;
begin
$t$,
$t$  if v_delta <> 0 then
    -- 26ª: o retrato da base. O estorno, o da liberação que ele desfaz; o
    -- resto, a conta da linha agora (a que deu este valor).
    if v_delta < 0 and p_motivo ilike 'estorno%' then
      select c.base_retrato into v_retrato
        from public.commissions c
       where c.line_id = p_linha and c.amount > 0 order by c.released_at desc, c.id desc limit 1;
    else
      select case when d.base is null then null else jsonb_build_object(
               'preco', v_l.preco, 'regra_valor', v_l.regra_valor, 'base', d.base,
               'base_desconto', d.base_desconto, 'base_fidelidade', d.base_fidelidade, 'base_taxa', d.base_taxa,
               'base_insumos', d.base_insumos, 'base_fator', d.base_fator) end
        into v_retrato
        from private.comissao_conta_detalhe(p_linha) d;
    end if;
    insert into public.commissions
$t$,
$t$       line_id, kind, motivo, released_at, transaction_id, base_retrato)$t$,
$t$      p_motivo, now(), p_transacao, v_retrato
    )$t$],
  array[1, 1, 1, 1]);

-- ─── 2. O extrato usa o retrato ────────────────────────────────────────────
select pg_temp.trocar_no_corpo(
  'public.comissoes_extrato_com_regra(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid)'::regprocedure,
  array[
-- 1. O lançamento leva o retrato; o "aguardando" não tem.
$t$           c.transaction_id
      from public.commissions c$t$,
$t$g.line_id, g.previsto, null::uuid$t$,
-- 2. O preço e o % do retrato.
$t$         l.preco, l.regra_tipo::text, l.regra_valor,$t$,
-- 3. A base e o que saiu dela, do retrato quando há.
$t$case when pg.base is not null then pg.base
$t$,
$t$case when pg.base is not null then pg.base_desconto else$t$,
$t$case when pg.base is not null then pg.base_taxa else$t$,
$t$case when pg.base is not null then pg.base_insumos else$t$,
$t$case when pg.base is not null then 1::numeric$t$,
$t$case when pg.base is not null then pg.base_fidelidade else$t$],
  array[
$t$           c.transaction_id, c.base_retrato
      from public.commissions c$t$,
$t$g.line_id, g.previsto, null::uuid, null::jsonb$t$,
$t$         coalesce((x.base_retrato ->> 'preco')::numeric, l.preco), l.regra_tipo::text,
         coalesce((x.base_retrato ->> 'regra_valor')::numeric, l.regra_valor),$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base')::numeric
              when pg.base is not null then pg.base
$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base_desconto')::numeric when pg.base is not null then pg.base_desconto else$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base_taxa')::numeric when pg.base is not null then pg.base_taxa else$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base_insumos')::numeric when pg.base is not null then pg.base_insumos else$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base_fator')::numeric when pg.base is not null then 1::numeric$t$,
$t$case when x.base_retrato is not null then (x.base_retrato ->> 'base_fidelidade')::numeric when pg.base is not null then pg.base_fidelidade else$t$],
  array[1, 1, 1, 1, 1, 1, 1, 1, 1]);

notify pgrst, 'reload schema';
