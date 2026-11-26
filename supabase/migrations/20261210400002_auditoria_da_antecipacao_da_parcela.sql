-- A antecipação da parcela da operadora entra na Auditoria (AD-04: "Entra na
-- Auditoria toda gravação que muda o que alguém FAZ no sistema"; A21 da 32ª).
-- "Marcar como recebida" e "Voltar para a receber" (`recebivel_do_cartao_receber`
-- e `_desfazer`) são de quem clicou, e a Auditoria não as mostrava: a
-- auditoria de 16/11 (20261116000001) deixou `recebiveis_do_cartao` de fora
-- por ser derivada da venda — a CRIAÇÃO é (nasce com o pagamento, que já
-- entra), a MUDANÇA não. Por isso só o UPDATE: a venda no cartão não ganha
-- uma linha por parcela. O que o próprio sistema muda junto de uma gravação
-- de alguém (o estorno cancela as parcelas, a bandeira trocada refaz a taxa)
-- entra na gravação dela, como os outros acompanhantes.
-- Rótulo: a parcela (1/15); valores: o dinheiro e as datas (AD-07: sem dado
-- pessoal). A cliente e a unidade vêm do pagamento (o pai).

drop trigger if exists auditoria_upd on public.recebiveis_do_cartao;
create trigger auditoria_upd after update on public.recebiveis_do_cartao
  referencing old table as velhas new table as novas
  for each statement execute function private.auditar('normal', 'parcela_numero,parcela_total',
    'valor,liquido,vencimento,recebida_em,cancelada_em,estornada_em', 'financial_transactions:transaction_id', '');

notify pgrst, 'reload schema';
