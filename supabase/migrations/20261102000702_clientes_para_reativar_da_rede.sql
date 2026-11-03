-- F7b (H3, decisão do Heitor: "ajuste para que a dona veja tudo, sempre"): o
-- quadro "Reativar clientes" só existia no dashboard da UNIDADE, e a dona da
-- clínica usa o /admin. Esta é a versão da REDE, partindo do corpo atual de
-- `metrics_clientes_para_reativar` (a da unidade, que não muda):
--
--  - a base são as clientes ATIVAS da rede cadastradas antes da janela (não só
--    as com a tag de uma unidade);
--  - "sumida" é quem não tem visita em NENHUMA unidade da clínica desde
--    `p_desde` — quem foi a outra unidade não sumiu (a cliente é da clínica,
--    H5; a mesma régua da retenção, ind-08);
--  - com a agenda "só os meus" (`p_professional_id`), as clientes DELA: quem
--    tem agendamento não cancelado com ela em qualquer unidade (a regra da
--    unidade, eq-02, sem o recorte da unidade);
--  - cada linha diz a UNIDADE: a da última visita concluída; quem nunca veio,
--    a do cadastro.
--
-- Recebe a rede por parâmetro: só o servidor (service_role) chama.

create or replace function public.metrics_clientes_para_reativar_rede(
  p_tenant uuid, p_desde timestamptz, p_limite integer default 3, p_professional_id uuid default null)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with unidades as (
    select b.id, b.name, b.slug from public.branches b where b.tenant_id = p_tenant
  ),
  da_rede as (
    select c.id, c.name, c.phone, c.branch_id
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and c.created_at < p_desde
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  inativos as (
    select d.*
    from da_rede d
    where not exists (
      select 1 from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = d.id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone, ult.aconteceu_em as ultima_visita,
      coalesce(ult.branch_id, i.branch_id) as unidade_id
    from inativos i
    left join lateral (
      select a.aconteceu_em, a.branch_id
      from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = i.id and a.status = 'COMPLETED'
      order by a.aconteceu_em desc
      limit 1
    ) ult on true
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'unidade', u.name, 'unidade_slug', u.slug)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
      left join unidades u on u.id = x.unidade_id
    ), '[]'::jsonb)
  );
$function$;

comment on function public.metrics_clientes_para_reativar_rede(uuid, timestamptz, integer, uuid) is
  'As clientes da REDE sem visita em nenhuma unidade desde p_desde (o total e as p_limite há mais tempo sem vir), com a unidade da última visita (ou a do cadastro). Só o servidor.';

revoke execute on function public.metrics_clientes_para_reativar_rede(uuid, timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.metrics_clientes_para_reativar_rede(uuid, timestamptz, integer, uuid) to service_role;

notify pgrst, 'reload schema';
