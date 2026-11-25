-- D7 da 30ª simulação (plataforma:AD-16, princípio 3: o registro diz o que
-- aconteceu). A Auditoria disse que a E03 pagou "R$ 9,00 em pontos" que ela não
-- usou: o voucher de 15% abateu R$ 24, e a frase (`lib/auditoria/frase.ts`) tirava
-- do `loyalty_discount` o `discount_value` do voucher — que no voucher de
-- PERCENTUAL é o percentual (15), não reais.
--
-- O rótulo do voucher passa a guardar também o `type` (DESCONTO_VALOR,
-- DESCONTO_PERCENTUAL, PROCEDIMENTO, PRODUTO): só o de valor fixo tem o desconto
-- em reais. É um valor sem dado pessoal, como o nome e o desconto. Vai no RÓTULO
-- (como o `discount_value`, migration 20261204400001): na edição o gatilho só
-- guarda os valores que mudaram, e o voucher usado muda a situação, não o tipo.
-- O que já foi gravado não muda (a auditoria é imutável); a leitura das
-- gravações de antes só cita pontos quando a gravação debitou pontos.

drop trigger if exists auditoria_ins on public.loyalty_vouchers;
drop trigger if exists auditoria_upd on public.loyalty_vouchers;
drop trigger if exists auditoria_del on public.loyalty_vouchers;
create trigger auditoria_ins after insert on public.loyalty_vouchers referencing new table as novas
  for each statement execute function private.auditar('normal', 'name,discount_value,type', 'status', '', '');
create trigger auditoria_upd after update on public.loyalty_vouchers referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'name,discount_value,type', 'status', '', '');
create trigger auditoria_del after delete on public.loyalty_vouchers referencing old table as velhas
  for each statement execute function private.auditar('normal', 'name,discount_value,type', 'status', '', '');

notify pgrst, 'reload schema';
