-- F7c (achado do Heitor, 2026-11-02): remover um número de WhatsApp com
-- conversas falhava com "duplicate key value violates unique constraint".
--
-- `conversations.whatsapp_number_id` vira nulo quando o número sai (SET NULL), e os índices únicos
-- do ramo "sem número" (`uniq_conversations_sem_numero_external` e
-- `uniq_conversations_sem_numero_phone`, migration 20260926000002) recusam a
-- conversa do número que perde a caixa quando a mesma pessoa JÁ tem uma
-- conversa sem número (de uma conexão antiga). Caso real: Bellaris Clinic,
-- contato …3707, destravado à mão (as 4 mensagens passaram à conversa de
-- setembro).
--
-- Antes de o número sair (`removerNumeroWhatsApp`), esta função JUNTA, numa
-- transação, cada conversa do número que colidiria na que já existia — a que
-- fica é a mais antiga, a que a pessoa já tinha (como o Heitor fez à mão). As
-- mensagens e as oportunidades (`leads.conversation_id`) passam para ela, e o
-- resumo (última mensagem, não lidas, aguardando, apelidos, tags) junta os
-- dois. A conversa do número fica VAZIA (sem mensagem, sem oportunidade, com o
-- resumo zerado) e o id dela volta: o servidor a tira e só então apaga o
-- número. Zerar o resumo deixa a função repetível — se a remoção parar no
-- meio, chamar de novo não soma as não lidas duas vezes.
--
-- Recebe a rede por parâmetro: só o servidor (service_role) chama.

create or replace function public.juntar_conversas_do_numero(p_numero uuid, p_tenant uuid)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_c       record;
  v_fica    record;
  v_vazias  uuid[] := '{}';
  v_nova    boolean;
begin
  perform 1 from public.whatsapp_numbers w
    where w.id = p_numero and w.tenant_id = p_tenant
    for update;
  if not found then
    raise exception 'Conexão não encontrada nesta rede.' using errcode = 'P0002';
  end if;

  for v_c in
    select * from public.conversations c
    where c.tenant_id = p_tenant and c.whatsapp_number_id = p_numero
    order by c.created_at
    for update
  loop
    -- A conversa sem número da mesma pessoa, no mesmo canal: pelo contato
    -- (o índice do external) ou pelo telefone (o índice do phone).
    select * into v_fica from public.conversations s
    where s.tenant_id = p_tenant and s.channel = v_c.channel and s.whatsapp_number_id is null
      and ((v_c.contact_external_id is not null and s.contact_external_id = v_c.contact_external_id)
        or (v_c.contact_phone is not null and s.contact_phone = v_c.contact_phone))
    order by (s.contact_external_id is not distinct from v_c.contact_external_id) desc, s.created_at
    limit 1
    for update;

    if not found then
      continue;
    end if;

    v_nova := coalesce(v_c.last_message_at, '-infinity'::timestamptz)
            > coalesce(v_fica.last_message_at, '-infinity'::timestamptz);

    update public.messages m set conversation_id = v_fica.id where m.conversation_id = v_c.id;
    update public.leads l set conversation_id = v_fica.id where l.conversation_id = v_c.id;

    update public.conversations s set
      last_message           = case when v_nova then v_c.last_message else s.last_message end,
      last_message_at        = greatest(s.last_message_at, v_c.last_message_at),
      last_message_direction = case when v_nova then v_c.last_message_direction else s.last_message_direction end,
      last_inbound_at        = greatest(s.last_inbound_at, v_c.last_inbound_at),
      last_outbound_at       = greatest(s.last_outbound_at, v_c.last_outbound_at),
      awaiting_since         = case when v_nova then v_c.awaiting_since else s.awaiting_since end,
      first_response_seconds = coalesce(s.first_response_seconds, v_c.first_response_seconds),
      unread_count           = s.unread_count + v_c.unread_count,
      status                 = case when v_nova then v_c.status else s.status end,
      provider               = coalesce(s.provider, v_c.provider),
      lead_id                = coalesce(v_c.lead_id, s.lead_id),
      client_id              = coalesce(s.client_id, v_c.client_id),
      contato_id             = coalesce(s.contato_id, v_c.contato_id),
      branch_id              = coalesce(s.branch_id, v_c.branch_id),
      attribution            = case when v_nova and v_c.attribution <> '{}'::jsonb then v_c.attribution else s.attribution end,
      contact_aliases        = (select coalesce(array_agg(distinct a), '{}') from unnest(s.contact_aliases || v_c.contact_aliases) a),
      tags                   = (select coalesce(array_agg(distinct t), '{}') from unnest(s.tags || v_c.tags) t),
      created_at             = least(s.created_at, v_c.created_at),
      updated_at             = now()
    where s.id = v_fica.id;

    -- A do número fica vazia, com o resumo zerado (repetível).
    update public.conversations c set
      last_message = null, last_message_at = null, last_message_direction = null,
      last_inbound_at = null, last_outbound_at = null, awaiting_since = null,
      unread_count = 0, lead_id = null, attribution = '{}'::jsonb, updated_at = now()
    where c.id = v_c.id;

    v_vazias := v_vazias || v_c.id;
  end loop;

  return v_vazias;
end;
$$;

comment on function public.juntar_conversas_do_numero(uuid, uuid) is
  'Antes de remover um número de WhatsApp: junta cada conversa dele que colidiria com uma conversa sem número da mesma pessoa na que já existia (mensagens e oportunidades vão para ela) e devolve as que ficaram vazias, para o servidor tirar. Só o servidor.';

revoke execute on function public.juntar_conversas_do_numero(uuid, uuid) from public, anon, authenticated;
grant execute on function public.juntar_conversas_do_numero(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
