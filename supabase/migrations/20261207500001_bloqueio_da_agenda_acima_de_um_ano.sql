-- O bloqueio da agenda deixa de recusar acima de um ano (AG-19).
--
-- O Heitor, 25/11, perguntado se um bloqueio mais longo (uma licença) recusa
-- ou avisa: escolheu "Acima de 1 ano avisa". Vale o fim que a pessoa escolher;
-- acima de um ano, a tela avisa ao lado do fim ("Acima do comum (mais de 1
-- ano). Confira: o valor vale como está.").
--
-- O banco guardava o teto da tela: `fim - inicio <= interval '366 days'`
-- (20261105003002). Fica o impossível (decisão do Claude, 25/11): o fim antes
-- do início, e acima de 100 anos — o limite das datas, os 36.500 dias de
-- `LIMITE_DE_DIAS` (`apps/web/lib/acima-do-comum.ts`, `recusaDoBloqueio`).

alter table public.agenda_bloqueios
  drop constraint if exists agenda_bloqueios_periodo,
  add constraint agenda_bloqueios_periodo check (fim > inicio and fim - inicio <= interval '36500 days');

notify pgrst, 'reload schema';
