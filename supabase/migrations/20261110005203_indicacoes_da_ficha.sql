-- O que a ficha de quem indicou mostra (decisão do Heitor, 2026-11-10: "a
-- ficha de quem indicou mostra 'Indicou: Marina (prêmio dado em 10/11)'"):
-- cada ficha que ela indicou, com o prêmio dado a ELA (o ativo e o último
-- estornado) e se a indicada já tem um pagamento que vale — a mesma régua do
-- prêmio (`private.indicacao_pagamento_que_vale`), para a tela não dizer
-- "prêmio quando ela pagar" de quem pagou antes da indicação.

create or replace function public.indicacoes_da_ficha(p_tenant uuid, p_cliente uuid)
returns table(
  indicada_id uuid, nome text, premio_em timestamptz, premio_tipo text, premio_pontos int,
  estornado_em timestamptz, ja_pagou boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id, c.name, pa.created_at, pa.tipo, pa.pontos, pe.estornado_em,
         exists (select 1 from public.financial_transactions f
                  where f.client_id = c.id and private.indicacao_pagamento_que_vale(f))
    from public.clients c
    left join lateral (
      select p.created_at, p.tipo, p.pontos from public.indicacao_premios p
       where p.indicada_id = c.id and p.indicadora_id = p_cliente and p.estornado_em is null
       limit 1
    ) pa on true
    left join lateral (
      select p.estornado_em from public.indicacao_premios p
       where p.indicada_id = c.id and p.indicadora_id = p_cliente and p.estornado_em is not null
       order by p.estornado_em desc
       limit 1
    ) pe on true
   where c.tenant_id = p_tenant and c.indicada_por = p_cliente
   order by c.created_at, c.id
$function$;

revoke execute on function public.indicacoes_da_ficha(uuid, uuid) from public, anon, authenticated;
grant execute on function public.indicacoes_da_ficha(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
