-- D-6 (decisão do Heitor, 2026-10-29): o cadastro do produto diz o USO —
-- Insumo, Revenda ou Os dois. O insumo aparece no atendimento (consumo da
-- sessão); a revenda, na venda de produto.
--
-- Até aqui havia só o liga/desliga "Produto para venda direta ao cliente", que
-- abria o preço de venda (`sale_price`) e que nada mais lia. O uso dos
-- produtos que já existem vem do que eles têm (o conservador — nada some de
-- onde já aparecia):
--   * com preço de venda → AMBOS (continua no atendimento e passa a poder ser
--     vendido);
--   * sem preço de venda → INSUMO.
-- A revenda sem preço de venda não existe (a restrição confere): não haveria
-- por quanto vender.

alter table public.products
  add column if not exists uso text not null default 'INSUMO';

update public.products set uso = 'AMBOS' where sale_price is not null and uso = 'INSUMO';

alter table public.products drop constraint if exists products_uso_check;
alter table public.products
  add constraint products_uso_check check (
    uso in ('INSUMO', 'REVENDA', 'AMBOS')
    and (uso = 'INSUMO' or sale_price is not null)
  );

comment on column public.products.uso is
  'O uso do produto (D-6): INSUMO (consumo no atendimento), REVENDA (venda à cliente) ou AMBOS. Revenda exige sale_price.';

notify pgrst, 'reload schema';
