-- A7 da 28ª simulação (princípio 3: o registro diz o que aconteceu). A Auditoria
-- resumia o recebimento da comanda: "Recebeu R$ 370,00 (Pix)" para quem pagou
-- R$ 450 com 10% de desconto, o Voucher R$ 30 e 100 pontos. A frase
-- (`lib/auditoria/frase.ts`) já lia o desconto e os pontos do lançamento — mas o
-- gatilho de `financial_transactions` nunca os guardou.
--
-- Passam a ir na auditoria (são valores, sem dado pessoal):
--   - `financial_transactions`: `sale_discount` (o desconto da venda) e
--     `loyalty_discount` (o pago com pontos e voucher);
--   - `loyalty_vouchers`: o `discount_value` (o desconto do voucher em reais), no
--     RÓTULO — na edição o gatilho só guarda os valores que MUDARAM, e o voucher
--     usado muda a situação, não o valor. Com ele, os pontos pagos à parte do
--     voucher se leem em reais (o `loyalty_discount` menos o voucher).
-- O que já foi gravado não muda (a auditoria é imutável); a leitura das
-- gravações de antes usa os pontos debitados na gravação.

drop trigger if exists auditoria_ins on public.financial_transactions;
drop trigger if exists auditoria_upd on public.financial_transactions;
drop trigger if exists auditoria_del on public.financial_transactions;
create trigger auditoria_ins after insert on public.financial_transactions referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal,sale_discount,loyalty_discount', '', '');
create trigger auditoria_upd after update on public.financial_transactions referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal,sale_discount,loyalty_discount', '', '');
create trigger auditoria_del after delete on public.financial_transactions referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'type,status,amount,payment_method,due_date,paid_at,category,is_paid,data_de_referencia,description,parcela_numero,parcela_total,cartao_vezes,fornecedor,nota_fiscal,sale_discount,loyalty_discount', '', '');

drop trigger if exists auditoria_ins on public.loyalty_vouchers;
drop trigger if exists auditoria_upd on public.loyalty_vouchers;
drop trigger if exists auditoria_del on public.loyalty_vouchers;
create trigger auditoria_ins after insert on public.loyalty_vouchers referencing new table as novas
  for each statement execute function private.auditar('normal', 'name,discount_value', 'status', '', '');
create trigger auditoria_upd after update on public.loyalty_vouchers referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'name,discount_value', 'status', '', '');
create trigger auditoria_del after delete on public.loyalty_vouchers referencing old table as velhas
  for each statement execute function private.auditar('normal', 'name,discount_value', 'status', '', '');

notify pgrst, 'reload schema';
