-- D2 da 32ª simulação (2026-11-26): a resposta que NÃO saiu não conta como
-- resposta. Decisão A da rodada (decisão do Claude, 26/11, pelo princípio 3:
-- a fila não pode dizer que respondeu quem não recebeu nada).
--
-- O envio do inbox (e o da automação, `enviarNaConversa`) grava a mensagem
-- como 'sending' ANTES de falar com o provedor, e depois a troca para 'sent'
-- ou 'failed'. O gatilho `on_new_message` olhava só a direção: todo outbound
-- zerava `awaiting_since` e gravava `first_response_seconds` — a mensagem
-- "Não enviada" tirava a conversa de "aguardando" e virava a 1ª resposta.
--
-- A régua: só a mensagem ACEITA pelo provedor ('sent', 'delivered', 'read')
-- conta.
--  1. No INSERT (`on_new_message`, troca de trechos no corpo VIVO, com a
--     conferência da contagem): o outbound que não nasce aceito ('sending',
--     'failed') mantém o "aguardando" e não mede a 1ª resposta. O eco do
--     aplicativo, que nasce 'sent', conta como antes. O resto (a última
--     mensagem, as não lidas, a importada) não muda.
--  2. No UPDATE da situação (`on_mensagem_aceita`, gatilho novo): a mensagem
--     que PASSA a aceita — o 'sending' que o provedor aceitou, ou o recibo que
--     chega antes do 'sent' — tira a conversa de "aguardando" e mede a 1ª
--     resposta até ali (o momento em que a cliente a recebeu). A que já era
--     aceita não conta de novo; a aceita que o provedor recusa depois (o
--     'failed' do webhook) não devolve o "aguardando": ela foi aceita.
--  3. Os dados de antes (princípio 4: só o que o banco prova): a conversa sem
--     "aguardando" cuja última mensagem da cliente não teve resposta aceita,
--     e teve uma não aceita, volta a aguardar desde a primeira mensagem dela
--     depois da última resposta aceita; a 1ª resposta medida até uma não
--     aceita passa a ser a da primeira aceita (ou nenhuma).

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

select pg_temp.trocar_no_corpo(
  'public.on_new_message()'::regprocedure,
  array[
    $t$when new.direction = 'inbound' then coalesce(c.awaiting_since, new.created_at)$t$,
    $t$when new.direction = 'outbound' and c.first_response_seconds is null and c.awaiting_since is not null$t$
  ],
  array[
    $t$when new.direction = 'inbound' then coalesce(c.awaiting_since, new.created_at)
      when new.status not in ('sent', 'delivered', 'read') then c.awaiting_since$t$,
    $t$when new.direction = 'outbound' and c.first_response_seconds is null and c.awaiting_since is not null and new.status in ('sent', 'delivered', 'read')$t$
  ],
  array[1, 1]
);

create or replace function public.on_mensagem_aceita()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.direction <> 'outbound' or new.importada then
    return new;
  end if;
  if old.status in ('sent', 'delivered', 'read') or new.status not in ('sent', 'delivered', 'read') then
    return new;
  end if;

  update public.conversations c
  set
    first_response_seconds = case
      when c.first_response_seconds is null and c.awaiting_since is not null
        then greatest(0, extract(epoch from (now() - c.awaiting_since))::int)
      else c.first_response_seconds
    end,
    awaiting_since = null
  where c.id = new.conversation_id;
  return new;
end;
$function$;

revoke all on function public.on_mensagem_aceita() from public, anon, authenticated;
grant execute on function public.on_mensagem_aceita() to service_role;

drop trigger if exists trg_mensagem_aceita on public.messages;
create trigger trg_mensagem_aceita
  after update of status on public.messages
  for each row
  when (old.status is distinct from new.status)
  execute function public.on_mensagem_aceita();

-- 3. Os dados de antes. "Aceita" = sent, delivered, read; a importada não entra.
-- 3a. O "aguardando" que a não enviada apagou.
with ultima_aceita as (
  select c.id,
    (select max(m.created_at) from public.messages m
      where m.conversation_id = c.id and m.direction = 'outbound' and not m.importada
        and m.status in ('sent', 'delivered', 'read')) as em
  from public.conversations c
  where c.awaiting_since is null
), desde as (
  select u.id,
    (select min(m.created_at) from public.messages m
      where m.conversation_id = u.id and m.direction = 'inbound' and not m.importada
        and (u.em is null or m.created_at > u.em)) as em
  from ultima_aceita u
)
update public.conversations c
set awaiting_since = d.em
from desde d
where c.id = d.id
  and c.awaiting_since is null
  and d.em is not null
  and exists (
    select 1 from public.messages m
    where m.conversation_id = c.id and m.direction = 'outbound' and not m.importada
      and m.status not in ('sent', 'delivered', 'read') and m.created_at >= d.em
  );

-- 3b. A 1ª resposta medida até uma não enviada.
with primeira as (
  select c.id,
    (select min(m.created_at) from public.messages m
      where m.conversation_id = c.id and m.direction = 'inbound' and not m.importada) as i0
  from public.conversations c
  where c.first_response_seconds is not null
), resposta as (
  select p.id, p.i0,
    (select min(m.created_at) from public.messages m
      where m.conversation_id = p.id and m.direction = 'outbound' and not m.importada
        and m.status in ('sent', 'delivered', 'read') and m.created_at >= p.i0) as o1
  from primeira p
  where p.i0 is not null
)
update public.conversations c
set first_response_seconds = case
  when r.o1 is null then null
  else greatest(0, extract(epoch from (r.o1 - r.i0))::int)
end
from resposta r
where c.id = r.id
  and exists (
    select 1 from public.messages m
    where m.conversation_id = c.id and m.direction = 'outbound' and not m.importada
      and m.status not in ('sent', 'delivered', 'read')
      and m.created_at >= r.i0 and (r.o1 is null or m.created_at < r.o1)
  );

notify pgrst, 'reload schema';
