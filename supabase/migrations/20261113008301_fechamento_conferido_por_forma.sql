-- CX4 do plano de adaptação (a revisão do Heitor, 2026-11-13: "Blz pode ser
-- assim"): o Fechamento do dia mora no PDV, uma linha por forma de pagamento —
-- o que o sistema registrou × o que a pessoa conferiu.
--
-- O dinheiro continua em `contado_dinheiro` (obrigatório), e a `diferenca`
-- gerada continua a do dinheiro. As outras formas são OPCIONAIS: `conferido`
-- guarda só as que a pessoa conferiu (forma → valor, a chave da linha do
-- fechamento: PIX, DEBIT_CARD, CREDIT_CARD:3…). A forma que não está aqui é
-- "não conferido" (princípio 4: não se supõe que bateu). A diferença de cada
-- uma é contra o retrato do `resumo` do mesmo fechamento.
--
-- A tabela continua só do servidor: a sessão não lê nem grava (nenhuma
-- política permissiva; as restritivas do suporte ficam).

alter table public.fechamentos_do_dia add column if not exists conferido jsonb;

comment on column public.fechamentos_do_dia.conferido is
  'CX4: o conferido das formas além do dinheiro (forma → valor); ausente = não conferido. O dinheiro é contado_dinheiro.';

notify pgrst, 'reload schema';
