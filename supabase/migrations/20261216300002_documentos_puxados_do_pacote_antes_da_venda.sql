-- P3 da 37ª simulação (2026-11-27): o contrato do pacote e os puxados, numa
-- assinatura só. PA-10 do catálogo de Vendas e financeiro: os termos e os
-- "outros documentos" dos procedimentos do pacote "vão à cliente junto do
-- contrato de pacote, para uma assinatura só" (PC2, o Heitor, 13/11: "ele
-- assina pelo pacote. o ideal era funcionar como no plano de tratamento").
--
-- O contrato de pacote se colhe ANTES do dinheiro
-- (public.documento_contrato_da_venda_do_pacote, 20261124000101); os puxados
-- só nasciam DEPOIS, com o pacote vendido (trg_documentos_do_pacote_vendido).
-- O link e a tela da venda levavam só o contrato, e o termo e a autorização
-- pediam uma segunda assinatura (D01 e D12 da 37ª).
--
-- Agora:
--  1. Com o contrato de pacote a colher, os puxados nascem com ele, do pacote
--     do CATÁLOGO (service_package_id, sem o vendido), pela mesma conta do
--     vendido (private.modelos_do_pacote_a_vender: o termo e os outros
--     documentos dos procedimentos, menos os excluídos). O MOMENTO deles é o
--     mesmo do contrato (a cliente e o pacote do catálogo, antes da venda): o
--     link e a tela de assinar levam todos (lib/documentos/momento.ts).
--  2. O aberto que já não vale (o modelo saiu do pacote, a versão mudou, outra
--     unidade) é cancelado ("O pacote mudou") e nasce de novo, como o contrato.
--  3. A venda os ADOTA (como adota o contrato): client_package_id passa a ser
--     o vendido, e documentos_emitir_do_pacote não os emite de novo. Os abertos
--     que sobraram (o modelo saiu do pacote) se cancelam.
--  4. O índice de "um contrato vivo por cliente e pacote" passa a olhar só o
--     CONTRATO (sem isso o puxado colidia com ele), e os puxados ganham o seu.
--     A adoção do contrato (documentos_emitir_do_pacote) também passa a olhar
--     só o contrato.
-- Os termos e os outros documentos continuam sem segurar o dinheiro (PA-10).

-- ─── 4. Os índices ────────────────────────────────────────────────────────
drop index if exists public.uniq_contrato_da_venda_do_pacote;
create unique index if not exists uniq_contrato_da_venda_do_pacote
  on public.issued_documents (client_id, service_package_id)
  where service_package_id is not null and client_package_id is null and kind = 'CONTRATO_PACOTE'
    and status not in ('CANCELADO', 'SUBSTITUIDO');

create unique index if not exists uniq_puxado_da_venda_do_pacote
  on public.issued_documents (client_id, service_package_id, template_id)
  where service_package_id is not null and client_package_id is null and kind <> 'CONTRATO_PACOTE'
    and status not in ('CANCELADO', 'SUBSTITUIDO');

-- ─── 1. Os modelos puxados do pacote do catálogo ─────────────────────────────
-- A conta de private.modelos_do_pacote (o vendido), sem o contrato de pacote.
create or replace function private.modelos_do_pacote_a_vender(p_pacote uuid)
returns table(template_id uuid, version_id uuid, kind text, source text, title text, enforcement text, procedure_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with pacote as (
    select sp.id, sp.tenant_id, sp.documentos_excluidos from public.service_packages sp where sp.id = p_pacote
  ), procs as (
    select distinct i.procedure_id from pacote v join public.service_package_items i on i.package_id = v.id
    union
    select sp.procedure_id from public.service_packages sp
     where sp.id = p_pacote
       and not exists (select 1 from public.service_package_items i where i.package_id = p_pacote)
  )
  select distinct on (t.id) t.id, ver.id, t.kind, t.source, t.name, t.enforcement, p.id
    from pacote v
    join procs on true
    join public.procedures p on p.id = procs.procedure_id and p.tenant_id = v.tenant_id
    join public.document_templates t
      on t.tenant_id = v.tenant_id and (t.id = p.consent_template_id or t.id = any (p.outros_documentos))
    join public.document_template_versions ver on ver.template_id = t.id and ver.version = t.current_version
   where t.is_active and t.kind in ('TERMO', 'DOCUMENTO')
     and not (t.id = any (coalesce(v.documentos_excluidos, '{}'::uuid[])))
   order by t.id, p.name
$$;

revoke all on function private.modelos_do_pacote_a_vender(uuid) from public, anon, authenticated;

-- ─── 1 e 2. Os puxados junto do contrato a colher ────────────────────────────
create or replace function private.documentos_puxados_antes_da_venda(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
  -- O aberto que já não vale: o modelo saiu do pacote, a versão mudou, ou a venda é noutra unidade.
  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = 'O pacote mudou', closed_at = now()
     where d.tenant_id = p_tenant and d.client_id = p_cliente and d.service_package_id = p_pacote
       and d.client_package_id is null and d.kind <> 'CONTRATO_PACOTE'
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
       and (d.branch_id is distinct from p_unidade
            or not exists (select 1 from private.modelos_do_pacote_a_vender(p_pacote) m
                            where m.template_id = d.template_id and m.version_id = d.template_version_id))
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', p_ator, jsonb_build_object('motivo', 'O pacote mudou'));
    update public.document_sign_links l set revoked_at = now()
     where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
  end loop;

  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      service_package_id, procedure_id, kind, source, title, moment, enforcement)
    select p_tenant, p_unidade, p_cliente, m.template_id, m.version_id,
           p_pacote, m.procedure_id, m.kind, m.source, m.title, 'VENDA_PACOTE', m.enforcement
      from private.modelos_do_pacote_a_vender(p_pacote) m
    on conflict (client_id, service_package_id, template_id)
      where service_package_id is not null and client_package_id is null and kind <> 'CONTRATO_PACOTE'
        and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
    values (v_doc.id, p_tenant, 'EMITIDO', p_ator, jsonb_build_object('pacote', p_pacote, 'antesDaVenda', true));

    insert into public.domain_events
      (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
    values (
      p_tenant, p_unidade, 'termo.emitido', 'termo', v_doc.id,
      jsonb_build_object(
        'clienteId', p_cliente,
        'clienteNome', (select c.name from public.clients c where c.id = p_cliente),
        'agendamentoId', null,
        'referencia', v_doc.title,
        'tipo', v_doc.kind,
        'exigencia', v_doc.enforcement),
      'sistema', 'banco', 'termo.emitido:' || v_doc.id)
    on conflict (tenant_id, chave) where chave is not null do nothing;
  end loop;
  return v_total;
end $$;

revoke all on function private.documentos_puxados_antes_da_venda(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Troca de trechos nos corpos VIVOS (o padrão de 20261130100007), com a conferência da contagem.
create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

-- O contrato da venda: o vivo é só o CONTRATO; o aberto (o de antes ou um novo) leva os puxados junto.
select pg_temp.trocar_no_corpo(
  'public.documento_contrato_da_venda_do_pacote(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure,
  array[
    $t$     and d.client_package_id is null and d.status not in ('CANCELADO', 'SUBSTITUIDO')$t$,
    $t$    elsif v_doc.template_version_id = v_t.versao and v_doc.branch_id is not distinct from p_unidade then$t$,
    $t$  return v_id;$t$
  ],
  array[
    $t$     and d.client_package_id is null and d.kind = 'CONTRATO_PACOTE' and d.status not in ('CANCELADO', 'SUBSTITUIDO')$t$,
    $t$    elsif v_doc.template_version_id = v_t.versao and v_doc.branch_id is not distinct from p_unidade then
      perform private.documentos_puxados_antes_da_venda(p_tenant, p_cliente, p_pacote, p_unidade, p_ator);$t$,
    $t$  perform private.documentos_puxados_antes_da_venda(p_tenant, p_cliente, p_pacote, p_unidade, p_ator);
  return v_id;$t$
  ],
  array[1, 1, 1]
);

-- A venda: adota o CONTRATO (só ele) e os puxados de antes; o aberto que sobrou se cancela.
select pg_temp.trocar_no_corpo(
  'public.documentos_emitir_do_pacote(uuid)'::regprocedure,
  array[
    $t$                    and d2.client_package_id is null and d2.status in ('ASSINADO', 'DISPENSADO')$t$,
    $t$  for v_doc in$t$
  ],
  array[
    $t$                    and d2.client_package_id is null and d2.kind = 'CONTRATO_PACOTE' and d2.status in ('ASSINADO', 'DISPENSADO')$t$,
    $t$  -- P3 da 37ª: os puxados nascidos antes da venda (com o contrato) passam ao vendido.
  update public.issued_documents d
     set client_package_id = cp.id
    from public.client_packages cp
   where cp.id = p_pacote_vendido
     and not cp.de_fora
     and cp.purchased_at = now()
     and d.client_id = cp.client_id and d.service_package_id = cp.package_id
     and d.client_package_id is null and d.kind <> 'CONTRATO_PACOTE'
     and d.status not in ('CANCELADO', 'SUBSTITUIDO')
     and d.template_id in (select m.template_id from private.modelos_do_pacote(cp.id) m where m.kind <> 'CONTRATO_PACOTE')
     and not exists (select 1 from public.issued_documents x
                      where x.client_package_id = cp.id and x.template_id = d.template_id
                        and x.status not in ('CANCELADO', 'SUBSTITUIDO'));

  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = 'O pacote mudou', closed_at = now()
      from public.client_packages cp
     where cp.id = p_pacote_vendido
       and not cp.de_fora
       and cp.purchased_at = now()
       and d.client_id = cp.client_id and d.service_package_id = cp.package_id
       and d.client_package_id is null and d.kind <> 'CONTRATO_PACOTE'
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', 'O pacote mudou'));
    update public.document_sign_links l set revoked_at = now()
     where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
  end loop;

  for v_doc in$t$
  ],
  array[1, 1]
);

notify pgrst, 'reload schema';
