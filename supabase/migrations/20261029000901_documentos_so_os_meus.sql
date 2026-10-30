-- Os documentos emitidos seguem o prontuário "só os meus" (decisão do Heitor,
-- 2026-10-29). Com `medical_records` OWN, a tela de Documentos (e a ferramenta
-- do Copilot, que usa as mesmas funções) mostra só os documentos das clientes
-- que ela atende: as que têm um agendamento com ela — qualquer um, inclusive
-- futuro —, a regra do prontuário OWN (`recusaDoAnexo`, `clienteAtendidaPor`).
-- O recorte é no banco: a lista é paginada e o resumo conta.
--
-- As duas funções que o app chama ganham uma SOBRECARGA com
-- `p_professional_id` (nulo = sem recorte), logo depois do período e SEM
-- default: a chamada antiga (sem ele, do app que ainda está no ar) só casa com
-- a assinatura antiga, e a nova (sempre com ele) só com a nova — o PostgREST
-- escolhe pelos nomes, sem ambiguidade. `documentos_emitidos` (a base) não
-- muda. As antigas ficam até alguém as apagar (apagar função pede uma
-- confirmação que o cliente do MCP não completa); nada novo as chama.
--
-- Só o servidor chama (`lib/metrics/documentos.ts`): fechadas a anon e
-- authenticated, abertas a service_role.

create or replace function public.documentos_emitidos_pagina(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone,
  p_professional_id uuid,
  p_situacao text default null::text, p_tipo text default null::text, p_busca text default null::text,
  p_limite integer default 50, p_offset integer default 0
)
 returns table(id uuid, titulo text, tipo text, status text, situacao text, exigencia text, faltando text[], cliente_id uuid, cliente text, branch_id uuid, procedimento text, agendamento_em timestamp with time zone, plano_id uuid, criado_em timestamp with time zone, assinado_em timestamp with time zone, canal text, envio text, enviado_em timestamp with time zone, aberto_em timestamp with time zone, link_ate timestamp with time zone, motivo text, codigo text, total bigint)
 language sql
 stable
 set search_path to ''
as $function$
  select v.*, count(*) over ()
    from public.documentos_emitidos(p_tenant, p_branch_ids, p_from, p_to) v
   where (case when p_situacao is null then v.situacao <> 'SUBSTITUIDO' else v.situacao = p_situacao end)
     and (p_tipo is null or v.tipo = p_tipo)
     and (nullif(btrim(p_busca), '') is null
          or v.cliente ilike '%' || btrim(p_busca) || '%'
          or v.titulo  ilike '%' || btrim(p_busca) || '%')
     -- Prontuário "só os meus": a cliente que tem um agendamento com ela.
     and (p_professional_id is null or exists (
           select 1 from public.appointments ap
            where ap.client_id = v.cliente_id and ap.professional_id = p_professional_id))
   order by v.criado_em desc, v.id
   limit greatest(1, least(p_limite, 200)) offset greatest(0, p_offset)
$function$;

create or replace function public.documentos_emitidos_resumo(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone,
  p_professional_id uuid
)
 returns table(total bigint, abertos bigint, faltam_dados bigint, a_enviar bigint, enviados bigint, assinados bigint, dispensados bigint, cancelados bigint)
 language sql
 stable
 set search_path to ''
as $function$
  select count(*) filter (where v.situacao <> 'SUBSTITUIDO'),
         count(*) filter (where v.situacao in ('FALTAM_DADOS', 'A_ENVIAR', 'ENVIADO')),
         count(*) filter (where v.situacao = 'FALTAM_DADOS'),
         count(*) filter (where v.situacao = 'A_ENVIAR'),
         count(*) filter (where v.situacao = 'ENVIADO'),
         count(*) filter (where v.situacao = 'ASSINADO'),
         count(*) filter (where v.situacao = 'DISPENSADO'),
         count(*) filter (where v.situacao = 'CANCELADO')
    from public.documentos_emitidos(p_tenant, p_branch_ids, p_from, p_to) v
   where p_professional_id is null or exists (
           select 1 from public.appointments ap
            where ap.client_id = v.cliente_id and ap.professional_id = p_professional_id)
$function$;

revoke execute on function public.documentos_emitidos_pagina(uuid, uuid[], timestamptz, timestamptz, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.documentos_emitidos_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.documentos_emitidos_pagina(uuid, uuid[], timestamptz, timestamptz, uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.documentos_emitidos_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
