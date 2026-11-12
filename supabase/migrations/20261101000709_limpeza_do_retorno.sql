-- F7 (aut-04): a LIMPEZA do "Retorno em N dias" (D-12). APLICADA em
-- 12/11/2026, com o Heitor presente (H14). Desde 20261101000701 nada lê nem
-- grava estas colunas e ninguém chama a função (o dashboard, o cron e a
-- conclusão saíram do código).

drop function public.retornos_a_marcar(uuid, uuid, date, date, uuid);

alter table public.appointments
  drop column retorno_em_dias,
  drop column retorno_para,
  drop column retorno_avisado_em;

notify pgrst, 'reload schema';
