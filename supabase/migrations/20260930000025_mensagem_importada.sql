-- Mensagem IMPORTADA: o histórico do WhatsApp Business que a coexistência traz
-- quando a clínica conecta o número pelo cadastro incorporado da Meta (até 180
-- dias de conversas, em pedaços e fora de ordem).
--
-- O gatilho `on_new_message` tratava toda mensagem como a MAIS RECENTE da
-- conversa e somava não lida a toda entrada. Com o histórico, a conversa
-- mostraria como "última" a mensagem que chegou por último no lote (que pode
-- ser de meses atrás), com centenas de não lidas e um "cliente aguardando"
-- aberto desde então.
--
-- A importada:
--  - só vira a última mensagem se for MAIS NOVA que a que está lá;
--  - não conta como não lida, não abre nem fecha o "aguardando", não mede
--    tempo de primeira resposta;
--  - avança `last_inbound_at` / `last_outbound_at` só para a frente.
-- A mensagem normal (importada = false) segue EXATAMENTE a regra de antes.

alter table public.messages
  add column if not exists importada boolean not null default false;

comment on column public.messages.importada is
  'Veio do histórico do WhatsApp Business (coexistência), não aconteceu agora. O gatilho on_new_message não a trata como a mais recente nem como não lida.';

create or replace function public.on_new_message()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_ultima timestamptz;
begin
  if new.importada then
    select c.last_message_at into v_ultima
      from public.conversations c where c.id = new.conversation_id;

    update public.conversations c
    set
      last_message           = case when v_ultima is null or new.created_at >= v_ultima then left(new.content, 80) else c.last_message end,
      last_message_at        = case when v_ultima is null or new.created_at >= v_ultima then new.created_at else c.last_message_at end,
      last_message_direction = case when v_ultima is null or new.created_at >= v_ultima then new.direction else c.last_message_direction end,
      updated_at             = now(),
      last_inbound_at  = case when new.direction = 'inbound'  then greatest(c.last_inbound_at,  new.created_at) else c.last_inbound_at  end,
      last_outbound_at = case when new.direction = 'outbound' then greatest(c.last_outbound_at, new.created_at) else c.last_outbound_at end
    where c.id = new.conversation_id;
    return new;
  end if;

  update public.conversations c
  set
    last_message           = left(new.content, 80),
    last_message_at        = new.created_at,
    updated_at             = now(),
    last_message_direction = new.direction,
    unread_count = case when new.direction = 'inbound' then c.unread_count + 1 else c.unread_count end,
    last_inbound_at  = case when new.direction = 'inbound'  then new.created_at else c.last_inbound_at  end,
    last_outbound_at = case when new.direction = 'outbound' then new.created_at else c.last_outbound_at end,
    -- Cliente aguardando: inbound inicia o relógio se ainda não estava aguardando; outbound zera.
    awaiting_since = case
      when new.direction = 'inbound' then coalesce(c.awaiting_since, new.created_at)
      else null
    end,
    -- Tempo da 1ª resposta: gravado uma única vez, quando o 1º outbound responde um inbound pendente.
    first_response_seconds = case
      when new.direction = 'outbound' and c.first_response_seconds is null and c.awaiting_since is not null
        then greatest(0, extract(epoch from (new.created_at - c.awaiting_since))::int)
      else c.first_response_seconds
    end
  where c.id = new.conversation_id;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
