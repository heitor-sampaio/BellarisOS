-- A5 da 21ª simulação (2026-11-17; princípio 3): o "Receber o plano" dizia
-- "Contrato de prestação de serviços" (o nome do modelo, que é o título do
-- documento emitido), e o documento aberto dizia "Contrato de prestação de
-- serviços estéticos" (o título do texto semeado). A rede nova nasce com o
-- título do texto igual ao nome do modelo. O modelo de quem já existe não muda:
-- é da rede, e a versão gravada não se altera (documentos.md, "O que nunca
-- fazer aqui") — quem quiser edita o modelo. Só muda o título do texto do
-- contrato de plano; o resto da função é o mesmo de 20261115200001.

create or replace function public.documentos_modelos_padrao(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r jsonb;
begin
  if not exists (select 1 from public.document_templates t
                  where t.tenant_id = p_tenant and (t.system_key = 'CONTRATO_PLANO_PADRAO'
                        or (t.kind = 'CONTRATO_PLANO' and t.is_active))) then
    v_r := public.documento_modelo_salvar(
      p_tenant, null, 'Contrato de prestação de serviços', 'CONTRATO_PLANO', 'EDITOR', null, 'BLOQUEIA',
      E'# Contrato de prestação de serviços\n\n'
      || E'**Contratante:** {{cliente.nome}}\n'
      || E'**Contratada:** {{unidade.nome}} — {{rede.nome}}\n'
      || E'**Data:** {{data.hoje}}\n\n'
      || E'## Serviços contratados\n'
      || E'{{procedimentos.lista}}\n\n'
      || E'**Valor total:** {{plano.total}}\n'
      || E'**Forma de pagamento:** {{pagamento.forma}}\n\n'
      || E'A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.\n\n'
      || E'O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.\n\n'
      || E'Li, entendi e concordo com os termos deste contrato.\n\n'
      || E'[[assinatura]]',
      null, null, null, null, null,
      array['cliente.nome', 'unidade.nome', 'rede.nome', 'data.hoje', 'procedimentos.lista', 'plano.total', 'pagamento.forma'],
      true, null);
    update public.document_templates t set system_key = 'CONTRATO_PLANO_PADRAO' where t.id = (v_r->>'id')::uuid;
  end if;

  if not exists (select 1 from public.document_templates t
                  where t.tenant_id = p_tenant and (t.system_key = 'CONTRATO_PACOTE_PADRAO'
                        or (t.kind = 'CONTRATO_PACOTE' and t.is_active))) then
    v_r := public.documento_modelo_salvar(
      p_tenant, null, 'Contrato de pacote', 'CONTRATO_PACOTE', 'EDITOR', null, 'BLOQUEIA',
      E'# Contrato de pacote de serviços estéticos\n\n'
      || E'**Contratante:** {{cliente.nome}}\n'
      || E'**Contratada:** {{unidade.nome}} — {{rede.nome}}\n'
      || E'**Data:** {{data.hoje}}\n\n'
      || E'## Pacote contratado: {{pacote.nome}}\n'
      || E'{{pacote.procedimentos}}\n\n'
      || E'**Sessões:** {{pacote.sessoes}}\n'
      || E'**Validade:** {{pacote.validade}}\n'
      || E'**Valor total:** {{pacote.total}}\n'
      || E'**Forma de pagamento:** {{pagamento.forma}}\n\n'
      || E'As sessões do pacote são agendadas conforme a agenda da contratada e valem só para os procedimentos listados.\n\n'
      || E'A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.\n\n'
      || E'O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.\n\n'
      || E'Li, entendi e concordo com os termos deste contrato.\n\n'
      || E'[[assinatura]]',
      null, null, null, null, null,
      array['cliente.nome', 'unidade.nome', 'rede.nome', 'data.hoje', 'pacote.nome', 'pacote.procedimentos',
            'pacote.sessoes', 'pacote.validade', 'pacote.total', 'pagamento.forma'],
      true, null);
    update public.document_templates t set system_key = 'CONTRATO_PACOTE_PADRAO' where t.id = (v_r->>'id')::uuid;
  end if;
end $function$;

revoke execute on function public.documentos_modelos_padrao(uuid) from public, anon, authenticated;
grant execute on function public.documentos_modelos_padrao(uuid) to service_role;

notify pgrst, 'reload schema';
