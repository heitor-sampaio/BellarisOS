-- A14 da 9ª simulação (2026-11-07): a despesa não tinha "Boleto" entre as
-- formas — a luz e o aluguel se pagam por boleto, e ficavam "Não informado"
-- (o "—" do CSV e dos relatórios por forma). O Boleto é uma forma da DESPESA
-- (a tela só o oferece nela; a action recusa na receita). O nome da forma no
-- banco é o espelho de `rotuloDaForma` (lib/financeiro/formas.ts): forma nova
-- entra NOS DOIS.

alter type public."PaymentMethod" add value if not exists 'BOLETO';

create or replace function private.rotulo_da_forma(p_metodo text, p_vezes integer default null::integer)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case when p_metodo is null then null else
    coalesce(case p_metodo
      when 'CASH'            then 'Dinheiro'
      when 'PIX'             then 'Pix'
      when 'DEBIT_CARD'      then 'Débito'
      when 'CREDIT_CARD'     then 'Crédito'
      when 'INTERNAL_CREDIT' then 'Crédito interno'
      when 'BOLETO'          then 'Boleto'
    end, p_metodo)
    || case when p_metodo = 'CREDIT_CARD' and coalesce(p_vezes, 1) > 1 then ' ' || p_vezes || 'x' else '' end
  end
$function$;

notify pgrst, 'reload schema';
