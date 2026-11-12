-- A limpeza do que ficou sem uso (H14 do levantamento das regras, com o
-- Heitor presente, 12/11). Conferido antes, um por um: nenhum código dos três
-- apps, nenhum spec e nenhuma função do banco chama ou lê o que sai aqui.
-- Sem cascade: se algo ainda dependesse, o drop falharia e nada sairia.
--
-- - juntar_conversas_do_numero(uuid, uuid): sem uso desde a F14;
-- - metrics_estornos_do_dia e metrics_taxa_dos_lancamentos: a régua do caixa
--   passou a ser metrics_movimentos_pagos (F61);
-- - estoque_ajuste: trocado por estoque_ajuste_com_lote (contava o frasco
--   aberto inteiro);
-- - plano_cancelar_comissao_de_venda: o cancelamento do plano estorna pela
--   comissão do lançamento;
-- - private.avaliacoes_dos_procedimentos_juncao_descartada: só linhas de
--   teste, vazia (F18);
-- - leads.stage: a etapa é stage_id desde o funil configurável;
-- - dois domain_events órfãos de testes de estoque ([e2e], já despachados).

drop function public.juntar_conversas_do_numero(uuid, uuid);
drop function public.metrics_estornos_do_dia(uuid, uuid, timestamptz, timestamptz);
drop function public.metrics_taxa_dos_lancamentos(uuid, uuid[]);
drop function public.estoque_ajuste(uuid, uuid, numeric, text, text);
drop function public.plano_cancelar_comissao_de_venda(uuid, uuid);
drop table private.avaliacoes_dos_procedimentos_juncao_descartada;
alter table public.leads drop column stage;

delete from public.domain_events
 where id in ('70a6a758-b329-4474-8ffe-2630b8503a04', '8e5b1ca2-d2aa-459f-87b1-0f4421774c05');

notify pgrst, 'reload schema';
