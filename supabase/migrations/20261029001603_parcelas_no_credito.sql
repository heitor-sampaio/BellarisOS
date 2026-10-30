-- D-15 (decisão do Heitor, 2026-10-29): "A clínica configura 'parcela até
-- Nx'. O padrão é o maior número de parcelas com taxa cadastrada."
--
-- Até quantas vezes a rede parcela no cartão de crédito (o "Vezes no cartão",
-- pago na hora — vendas-financeiro.md §9.6). Nulo = o padrão, calculado pelo
-- app (lib/financeiro/vezes-do-cartao.ts): a maior parcela do crédito com taxa
-- em payment_fees; sem nenhuma, 12x. Gravada em Configurações → Comissões,
-- pelo servidor (financial: MANAGE, abrangência de rede).

alter table public.tenants
  add column if not exists cartao_max_vezes smallint
    check (cartao_max_vezes is null or cartao_max_vezes between 1 and 12);

comment on column public.tenants.cartao_max_vezes is
  'Parcelar no crédito até N vezes (1–12). Nulo = a maior parcela do crédito com taxa em payment_fees; sem nenhuma, 12.';
