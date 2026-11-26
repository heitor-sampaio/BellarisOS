-- D9 da 31ª simulação (2026-11-26; a Auditoria, docs/regras/plataforma.md;
-- princípio 3): a perda e o inventário não diziam o que aconteceu. Do movimento
-- de estoque a Auditoria guarda o rótulo (o produto) e os valores do gatilho —
-- o tipo, a quantidade, o custo e a correção de cadastro. Sem o motivo da perda e
-- o saldo depois do movimento, a frase não tinha como dizer "Registrou a perda de
-- 2 frascos de X (Vencido)" nem "o inventário ajustou de 970 g para 950 g" (o
-- saldo antes é o depois menos a quantidade). Os dois entram nos valores.
drop trigger if exists auditoria_ins on public.stock_movements;
drop trigger if exists auditoria_upd on public.stock_movements;
drop trigger if exists auditoria_del on public.stock_movements;
create trigger auditoria_ins after insert on public.stock_movements referencing new table as novas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro,motivo_da_perda,balance_after', '', '');
create trigger auditoria_upd after update on public.stock_movements referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro,motivo_da_perda,balance_after', '', '');
create trigger auditoria_del after delete on public.stock_movements referencing old table as velhas
  for each statement execute function private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro,motivo_da_perda,balance_after', '', '');

notify pgrst, 'reload schema';
