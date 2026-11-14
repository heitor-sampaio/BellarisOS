-- Bloco Plano de tratamento, leva 2 (a revisão do Heitor de 2026-11-13).
--
-- DC1c/PC9b no plano: o plano puxa dos procedimentos o termo E os outros
-- documentos (nunca o contrato do procedimento), e a rede exclui o que quiser
-- — guardado no plano, como no pacote (`service_packages.documentos_excluidos`).
--
-- DC4: os termos e os outros nascem no ACEITE (o plano rascunho ou proposto
-- muda e pode nunca ser aceito; "Aceito, os documentos ficam prontos" — PT1b);
-- o contrato de plano nasce no PDV, COM a forma de pagamento (PT1c).
--
-- FD2a/FD2b no plano: os pontos e o voucher se usam na comanda do plano
-- (`plano_checkout_com_fidelidade`), pelo mesmo `private.fidelidade_na_venda`
-- das outras vendas.
--
-- Destrutiva: `documentos_emitir_do_plano(uuid)` sai, e no lugar entra
-- `documentos_emitir_do_plano(uuid, boolean default true)` — a chamada de um
-- argumento (o app, pelo PostgREST) segue a mesma, emitindo tudo.

alter table public.treatment_plans
  add column if not exists documentos_excluidos uuid[] not null default '{}';

comment on column public.treatment_plans.documentos_excluidos is
  'DC1c/PC9b: os documentos puxados dos procedimentos que a rede tirou deste plano.';

-- Os modelos do plano: o termo e os outros de cada procedimento distinto das
-- sessões, tirados os excluídos, mais o contrato de plano ativo da rede.
create or replace function private.modelos_do_plano(p_plano uuid)
 returns table(template_id uuid, version_id uuid, kind text, source text, title text, enforcement text, procedure_id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with plano as (
    select tp.id, b.tenant_id, tp.documentos_excluidos
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
     where tp.id = p_plano
  ), termos as (
    select distinct on (t.id) t.id, v.id as versao, t.kind, t.source, t.name, t.enforcement, p.id as proc
      from plano
      join public.treatment_plan_sessions s on s.plan_id = plano.id
      join public.treatment_plan_session_procedures sp on sp.session_id = s.id
      join public.procedures p on p.id = sp.procedure_id
      join public.document_templates t
        on (t.id = p.consent_template_id or t.id = any(coalesce(p.outros_documentos, '{}')))
       and t.tenant_id = plano.tenant_id
      join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
     where t.is_active
       and t.kind in ('TERMO', 'DOCUMENTO')
       and not (t.id = any(plano.documentos_excluidos))
     order by t.id, p.name
  )
  select termos.id, termos.versao, termos.kind, termos.source, termos.name, termos.enforcement, termos.proc from termos
  union all
  select t.id, v.id, t.kind, t.source, t.name, t.enforcement, null::uuid
    from plano
    join public.document_templates t on t.tenant_id = plano.tenant_id and t.kind = 'CONTRATO_PLANO' and t.is_active
    join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
$function$;

drop function if exists public.documentos_emitir_do_plano(uuid);

-- p_com_contrato = false: o aceite (termos e outros); o PDV chama com o
-- padrão (true) e emite também o contrato de plano. O contrato fica na lista
-- de "o que é do plano" mesmo quando não é emitido — senão o aceite
-- cancelaria um contrato já emitido como "O plano mudou".
create or replace function public.documentos_emitir_do_plano(p_plano uuid, p_com_contrato boolean default true)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_doc   record;
  v_total int := 0;
begin
  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = 'O plano mudou', closed_at = now()
     where d.treatment_plan_id = p_plano and d.appointment_id is null
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
       and d.template_id not in (select m.template_id from private.modelos_do_plano(p_plano) m)
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', 'O plano mudou'));
  end loop;

  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      treatment_plan_id, procedure_id, kind, source, title, moment, enforcement)
    select b.tenant_id, tp.branch_id, tp.client_id, m.template_id, m.version_id,
           tp.id, m.procedure_id, m.kind, m.source, m.title, 'FECHAMENTO_PLANO', m.enforcement
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
      cross join lateral private.modelos_do_plano(tp.id) m
     where tp.id = p_plano
       and (p_com_contrato or m.kind <> 'CONTRATO_PLANO')
       -- Termos e contratos são do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
    on conflict (treatment_plan_id, template_id)
      where treatment_plan_id is not null and appointment_id is null and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, tenant_id, branch_id, client_id, treatment_plan_id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'EMITIDO', jsonb_build_object('planoId', v_doc.treatment_plan_id));

    insert into public.domain_events
      (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
    values (
      v_doc.tenant_id, v_doc.branch_id, 'termo.emitido', 'termo', v_doc.id,
      jsonb_build_object(
        'clienteId', v_doc.client_id,
        'clienteNome', (select c.name from public.clients c where c.id = v_doc.client_id),
        'agendamentoId', null,
        'referencia', v_doc.title,
        'tipo', v_doc.kind,
        'exigencia', v_doc.enforcement),
      'sistema', 'banco', 'termo.emitido:' || v_doc.id)
    on conflict (tenant_id, chave) where chave is not null do nothing;
  end loop;
  return v_total;
end $function$;

revoke execute on function public.documentos_emitir_do_plano(uuid, boolean) from public, anon, authenticated;
grant execute on function public.documentos_emitir_do_plano(uuid, boolean) to service_role;

-- O aceite emite os termos e os outros; o contrato de plano fica para o PDV.
create or replace function private.documentos_bloqueiam_plano()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.status <> 'ACCEPTED' or old.status = 'ACCEPTED' then return new; end if;
  perform public.documentos_emitir_do_plano(new.id, false);
  return new;
end $function$;

-- Os pontos e o voucher na comanda do plano (FD2a/FD2b). O mesmo molde de
-- `venda_com_fidelidade`: o lançamento à vista nasce em aberto, e
-- `private.fidelidade_na_venda` confere o desconto, abate e o marca pago — o
-- ganho de pontos vem do gatilho de sempre (receita paga).
create or replace function public.plano_checkout_com_fidelidade(
  p_tenant uuid, p_plano uuid, p_ator uuid, p_desconto numeric, p_precos jsonb, p_lancamentos jsonb,
  p_agendamentos jsonb, p_com_comissao boolean, p_vendedor uuid, p_fidelidade jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_l     jsonb := p_lancamentos;
  v_r     jsonb;
  v_plano record;
begin
  if jsonb_typeof(v_l) is distinct from 'array' or jsonb_array_length(v_l) <> 1
     or not coalesce((v_l -> 0 ->> 'is_paid')::boolean, false) then
    raise exception 'Os pontos e o voucher se usam no pagamento à vista.' using errcode = 'P0001';
  end if;
  v_l := jsonb_build_array(jsonb_set(v_l -> 0, '{is_paid}', 'false'::jsonb));

  v_r := public.plano_checkout(p_tenant, p_plano, p_ator, p_desconto, p_precos, v_l,
                               p_agendamentos, p_com_comissao, p_vendedor);

  select tp.client_id, tp.branch_id into v_plano from public.treatment_plans tp where tp.id = p_plano;
  perform private.fidelidade_na_venda(p_tenant, v_plano.client_id, v_plano.branch_id,
                                      (v_r ->> 'transacao')::uuid, p_fidelidade, p_ator);
  return v_r;
end $function$;

revoke execute on function public.plano_checkout_com_fidelidade(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plano_checkout_com_fidelidade(uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, boolean, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
