-- A tela de Documentos (pedido do Heitor, 2026-10-14): todos os termos e
-- contratos emitidos da rede, com a SITUAÇÃO de cada um — gerado, enviado,
-- assinado. Só leitura: as ações continuam na ficha do cliente.
--
-- A situação junta o status do documento com a trilha (issued_document_events):
--   FALTAM_DADOS  INCOMPLETO — o cadastro não tem o que o modelo pede
--   A_ENVIAR      A_GERAR ou PENDENTE sem nenhum envio (a recepção ainda não
--                 mandou: nem link, nem portal, nem conversa). O A_GERAR é o
--                 que o gatilho acabou de criar; a tela o monta ao listar.
--   ENVIADO       PENDENTE com envio: link gerado, pedido no portal ou link
--                 mandado pela conversa. O "envio" mostrado é o mais recente.
--   ASSINADO, DISPENSADO, CANCELADO, SUBSTITUIDO — o status como está.
--
-- O eixo do período é a emissão (created_at). O substituído só aparece quando
-- pedido: foi trocado por outro documento, que é o que vale.

create or replace function public.documentos_emitidos(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table(
  id uuid, titulo text, tipo text, status text, situacao text, exigencia text,
  faltando text[], cliente_id uuid, cliente text, branch_id uuid, procedimento text,
  agendamento_em timestamptz, plano_id uuid, criado_em timestamptz, assinado_em timestamptz,
  canal text, envio text, enviado_em timestamptz, aberto_em timestamptz, link_ate timestamptz,
  motivo text, codigo text
)
language sql
stable
set search_path = ''
as $$
  select d.id, d.title, d.kind, d.status,
         case
           when d.status = 'INCOMPLETO' then 'FALTAM_DADOS'
           when d.status in ('A_GERAR', 'PENDENTE') and env.kind is null then 'A_ENVIAR'
           when d.status in ('A_GERAR', 'PENDENTE') then 'ENVIADO'
           else d.status
         end,
         d.enforcement, d.missing_fields, d.client_id, c.name, d.branch_id, pr.name,
         a.scheduled_at, d.treatment_plan_id, d.created_at, d.signed_at,
         sig.channel, env.kind, env.created_at, abr.created_at, lnk.expires_at,
         d.closed_reason, d.verification_code
    from public.issued_documents d
    left join public.clients c on c.id = d.client_id
    left join public.procedures pr on pr.id = d.procedure_id
    left join public.appointments a on a.id = d.appointment_id
    left join lateral (
      select e.kind, e.created_at from public.issued_document_events e
       where e.issued_document_id = d.id
         and e.kind in ('LINK_GERADO', 'NOTIFICADO_PORTAL', 'LINK_ENVIADO_CONVERSA')
       order by e.created_at desc, e.id desc limit 1
    ) env on true
    left join lateral (
      select e.created_at from public.issued_document_events e
       where e.issued_document_id = d.id and e.kind in ('VISUALIZADO', 'IDENTIDADE_OK')
       order by e.created_at desc limit 1
    ) abr on true
    left join lateral (
      select l.expires_at from public.document_sign_links l
       where l.issued_document_id = d.id and l.used_at is null and l.revoked_at is null
         and l.expires_at > now()
       order by l.created_at desc limit 1
    ) lnk on true
    left join lateral (
      select s.channel from public.document_signatures s
       where s.issued_document_id = d.id order by s.signed_at desc limit 1
    ) sig on true
   where d.tenant_id = p_tenant
     and (p_branch_ids is null or d.branch_id = any (p_branch_ids))
     and d.created_at between p_from and p_to
$$;

-- Uma página da lista, do mais novo para o mais antigo, com filtros.
create or replace function public.documentos_emitidos_pagina(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz,
  p_situacao text default null, p_tipo text default null, p_busca text default null,
  p_limite integer default 50, p_offset integer default 0
)
returns table(
  id uuid, titulo text, tipo text, status text, situacao text, exigencia text,
  faltando text[], cliente_id uuid, cliente text, branch_id uuid, procedimento text,
  agendamento_em timestamptz, plano_id uuid, criado_em timestamptz, assinado_em timestamptz,
  canal text, envio text, enviado_em timestamptz, aberto_em timestamptz, link_ate timestamptz,
  motivo text, codigo text, total bigint
)
language sql
stable
set search_path = ''
as $$
  select v.*, count(*) over ()
    from public.documentos_emitidos(p_tenant, p_branch_ids, p_from, p_to) v
   where (case when p_situacao is null then v.situacao <> 'SUBSTITUIDO' else v.situacao = p_situacao end)
     and (p_tipo is null or v.tipo = p_tipo)
     and (nullif(btrim(p_busca), '') is null
          or v.cliente ilike '%' || btrim(p_busca) || '%'
          or v.titulo  ilike '%' || btrim(p_busca) || '%')
   order by v.criado_em desc, v.id
   limit greatest(1, least(p_limite, 200)) offset greatest(0, p_offset)
$$;

-- Os números do topo. Abertos = faltam dados + a enviar + enviados.
create or replace function public.documentos_emitidos_resumo(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table(
  total bigint, abertos bigint, faltam_dados bigint, a_enviar bigint, enviados bigint,
  assinados bigint, dispensados bigint, cancelados bigint
)
language sql
stable
set search_path = ''
as $$
  select count(*) filter (where v.situacao <> 'SUBSTITUIDO'),
         count(*) filter (where v.situacao in ('FALTAM_DADOS', 'A_ENVIAR', 'ENVIADO')),
         count(*) filter (where v.situacao = 'FALTAM_DADOS'),
         count(*) filter (where v.situacao = 'A_ENVIAR'),
         count(*) filter (where v.situacao = 'ENVIADO'),
         count(*) filter (where v.situacao = 'ASSINADO'),
         count(*) filter (where v.situacao = 'DISPENSADO'),
         count(*) filter (where v.situacao = 'CANCELADO')
    from public.documentos_emitidos(p_tenant, p_branch_ids, p_from, p_to) v
$$;

create index if not exists issued_documents_tenant_created_idx
  on public.issued_documents (tenant_id, created_at desc);

-- Recebem a rede por parâmetro: só o servidor.
revoke execute on function public.documentos_emitidos(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.documentos_emitidos_pagina(uuid, uuid[], timestamptz, timestamptz, text, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.documentos_emitidos_resumo(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.documentos_emitidos(uuid, uuid[], timestamptz, timestamptz) to service_role;
grant execute on function public.documentos_emitidos_pagina(uuid, uuid[], timestamptz, timestamptz, text, text, text, integer, integer) to service_role;
grant execute on function public.documentos_emitidos_resumo(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
