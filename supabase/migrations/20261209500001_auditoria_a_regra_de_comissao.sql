-- A9 da 31ª simulação (princípio 3; plataforma:AD-13, a gravação se lê pelo FATO).
--
-- A regra de comissão saía "Criou a regra de comissão" — sete vezes, sem o
-- procedimento, de quem e o valor. O gatilho de `commission_rules` guardava o
-- tipo, o valor e o ativo; passa a guardar também o procedimento
-- (`procedure_id`) e a pessoa (`professional_id`) — ids, sem dado pessoal; o
-- nome se lê na hora de mostrar (`lib/auditoria/leitura.ts`). As colunas
-- `valor` e `percentage`, da lista de antes, não existem na tabela.
--
-- O que já foi gravado não muda (a auditoria é imutável); a leitura das
-- gravações de antes diz o valor, sem o de quê.

drop trigger if exists auditoria_ins on public.commission_rules;
drop trigger if exists auditoria_upd on public.commission_rules;
drop trigger if exists auditoria_del on public.commission_rules;
create trigger auditoria_ins after insert on public.commission_rules referencing new table as novas
  for each statement execute function private.auditar('normal', '', 'type,is_active,value,procedure_id,professional_id', '', '');
create trigger auditoria_upd after update on public.commission_rules referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', '', 'type,is_active,value,procedure_id,professional_id', '', '');
create trigger auditoria_del after delete on public.commission_rules referencing old table as velhas
  for each statement execute function private.auditar('normal', '', 'type,is_active,value,procedure_id,professional_id', '', '');

notify pgrst, 'reload schema';
