-- F20 (6ª simulação, 2026-11-04) — A47: a descrição que chega à cliente não
-- leva texto interno. O checkout do plano gravava "Plano de tratamento —
-- checkout novo paciente — parcela 1/2", e o recebimento no check-in "Plano de
-- tratamento — recebimento no check-in — entrada"; o app da cliente e o
-- recibo mostram a descrição. O app grava "Plano de tratamento — parcela 1/2"
-- desde a F20; aqui, os lançamentos de antes (só o texto: nenhum gatilho de
-- dinheiro olha a descrição).

update public.financial_transactions
   set description = replace(description, 'Plano de tratamento — checkout novo paciente', 'Plano de tratamento')
 where description like 'Plano de tratamento — checkout novo paciente%';

update public.financial_transactions
   set description = replace(description, 'Plano de tratamento — recebimento no check-in', 'Plano de tratamento')
 where description like 'Plano de tratamento — recebimento no check-in%';
