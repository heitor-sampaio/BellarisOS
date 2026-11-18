-- A10 da 24ª simulação: "Corrigiu o custo do lote de Preenchedor: de R$ 40.000,00
-- para R$ 400,00 por seringa". Na edição, a auditoria só guarda as colunas que
-- MUDARAM (e o rótulo): o custo corrigido chegava sem o produto. O `product_id`
-- passa a ser o rótulo do movimento — vai em toda linha, mudado ou não.
drop trigger if exists auditoria_ins on public.stock_movements;
drop trigger if exists auditoria_upd on public.stock_movements;
drop trigger if exists auditoria_del on public.stock_movements;
create trigger auditoria_ins after insert on public.stock_movements referencing new table as novas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro', '', '');
create trigger auditoria_upd after update on public.stock_movements referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro', '', '');
create trigger auditoria_del after delete on public.stock_movements referencing old table as velhas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro', '', '');

notify pgrst, 'reload schema';
