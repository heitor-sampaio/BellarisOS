-- Valor negociado na oportunidade.
--
-- `numeric(12,2)` como o resto do dinheiro do sistema (financial_transactions),
-- e NULO quando ainda não há proposta — zero significaria "negociado por nada",
-- que é outra coisa e estragaria qualquer média de ticket.
--
-- Os procedimentos da oportunidade já existiam em `lead_procedures`: o que
-- faltava era mostrá-los no painel e somar o preço deles como sugestão.

alter table public.leads
  add column if not exists value numeric(12,2);

comment on column public.leads.value is
  'Valor negociado. Nulo = ainda sem proposta; zero seria negociado por nada, que e diferente.';
