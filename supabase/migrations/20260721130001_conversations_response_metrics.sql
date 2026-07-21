-- Métricas de atendimento denormalizadas na conversa (mantidas pelo trigger on_new_message).
-- Barato de ler pela UI (inbox/funil): tempo de resposta, tempo desde a última interação,
-- e sinalização de leads aguardando resposta há muito tempo.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text,
  ADD COLUMN IF NOT EXISTS last_inbound_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_outbound_at       timestamptz,
  ADD COLUMN IF NOT EXISTS awaiting_since         timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_seconds integer;

CREATE OR REPLACE FUNCTION public.on_new_message()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
begin
  update public.conversations c
  set
    last_message           = left(new.content, 80),
    last_message_at        = new.created_at,
    updated_at             = now(),
    last_message_direction = new.direction,
    unread_count = case when new.direction = 'inbound' then c.unread_count + 1 else c.unread_count end,
    last_inbound_at  = case when new.direction = 'inbound'  then new.created_at else c.last_inbound_at  end,
    last_outbound_at = case when new.direction = 'outbound' then new.created_at else c.last_outbound_at end,
    awaiting_since = case
      when new.direction = 'inbound' then coalesce(c.awaiting_since, new.created_at)
      else null
    end,
    first_response_seconds = case
      when new.direction = 'outbound' and c.first_response_seconds is null and c.awaiting_since is not null
        then greatest(0, extract(epoch from (new.created_at - c.awaiting_since))::int)
      else c.first_response_seconds
    end
  where c.id = new.conversation_id;
  return new;
end;
$function$;
