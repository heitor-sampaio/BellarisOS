-- A4 da 32ª simulação (2026-11-26; AG-18 — agendar escreve "agendamento
-- criado" na linha do tempo da oportunidade aberta; princípio 3).
--
-- No painel da conversa do inbox, o "Agendamento criado" só aparecia depois
-- de recarregar: o agendamento feito em outra tela (a agenda, a ficha, o
-- Copilot) grava só em `lead_events`, e `lead_events` não marcava sinal
-- nenhum. A sessão só lê SINAIS (o Heitor, 19/11, "vai na 2"; CLAUDE.md §4):
-- a linha nova da linha do tempo marca o sinal de cada conversa da PESSOA da
-- oportunidade (`c:<id>`, o tópico 'conversa' de `private.marcar_sinal`) —
-- o painel mostra a linha do tempo do contato, de todas as conversas dele —,
-- e o painel, ao sinal, recarrega pelo servidor (que aplica o alcance).
--
-- Sem conteúdo nenhum no sinal: só a chave da conversa.

create or replace function private.sinal_da_linha_do_tempo()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  insert into public.sinais (tenant_id, topico, chave, mudou_em)
  select distinct cv.tenant_id, 'conversa', 'c:' || cv.id::text, now()
    from public.leads l
    join public.conversations cv
      on cv.tenant_id = l.tenant_id
     and (cv.id = l.conversation_id or (l.contato_id is not null and cv.contato_id = l.contato_id))
   where l.id = new.lead_id
     and l.tenant_id = new.tenant_id
  on conflict (tenant_id, topico, chave) do update set mudou_em = excluded.mudou_em
  where public.sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$function$;

revoke all on function private.sinal_da_linha_do_tempo() from public, anon, authenticated;
grant execute on function private.sinal_da_linha_do_tempo() to service_role;

drop trigger if exists trg_sinal_lead_events_conversa on public.lead_events;
create trigger trg_sinal_lead_events_conversa
  after insert on public.lead_events
  for each row
  execute function private.sinal_da_linha_do_tempo();

notify pgrst, 'reload schema';
