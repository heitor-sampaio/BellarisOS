-- Chamados: o que a verificação da fase 3 achou (2026-10-03).
--
-- 1. `chamado_responder` atribuía o chamado a quem mandasse QUALQUER mensagem
--    — "mudar situação" e "pedir autorização" (mensagens do sistema) faziam o
--    atendente virar o responsável sem "Assumir". Só a resposta do suporte
--    atribui.
-- 2. O bucket dos prints recusa no próprio storage o que o app já recusa:
--    PNG/JPEG, até 5 MB. Criado aqui (o app o criava na primeira vez).

create or replace function public.chamado_responder(
  p_ticket uuid, p_autor text, p_user uuid, p_staff uuid, p_corpo text, p_anexos jsonb,
  p_interna boolean, p_status text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_t record;
begin
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if p_status is not null and p_status not in ('aberto', 'em_andamento', 'aguardando_clinica', 'resolvido') then
    raise exception 'Situação inválida.';
  end if;
  insert into public.support_ticket_messages (ticket_id, author_kind, author_user_id, author_staff_id, body, anexos, interna)
  values (p_ticket, p_autor, p_user, p_staff, trim(p_corpo), coalesce(p_anexos, '[]'::jsonb), coalesce(p_interna, false))
  returning id into v_id;
  update public.support_tickets set
    status = coalesce(p_status, status),
    updated_at = now(),
    last_message_at = case when coalesce(p_interna, false) then last_message_at else now() end,
    last_staff_reply_at = case when p_autor = 'suporte' and not coalesce(p_interna, false) then now() else last_staff_reply_at end,
    resolved_at = case when coalesce(p_status, status) = 'resolvido' then coalesce(resolved_at, now()) else null end,
    assigned_staff_id = case when p_autor = 'suporte' then coalesce(assigned_staff_id, p_staff) else assigned_staff_id end
  where id = p_ticket;
  update public.support_signals set updated_at = now() where id = 1;
  return v_id;
end $$;
revoke execute on function public.chamado_responder(uuid, text, uuid, uuid, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.chamado_responder(uuid, text, uuid, uuid, text, jsonb, boolean, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suporte-anexos', 'suporte-anexos', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg'];

notify pgrst, 'reload schema';
