-- A mesma mensagem do WhatsApp entra UMA vez por conversa (2026-11-06).
--
-- A deduplicação do app era "procura pelo external_id; se não achou, grava":
-- duas entregas ao mesmo tempo (o histórico da coexistência chega em pedaços,
-- e a Meta reentrega) passavam as duas pela procura e gravavam as duas. A
-- Bellaris Clinic ficou com 34 mensagens do histórico de 07–09/05 em dobro, e
-- dali em diante a procura (maybeSingle) achava duas linhas e estourava
-- PGRST116: o webhook respondia 500 a cada reentrega delas (15 vezes em 05/11).
--
-- 1. Fica uma de cada par — a que tem a mídia, se só uma tiver; senão a
--    primeira gravada. As duas são cópias do mesmo histórico importado (lidas,
--    `importada`), e nada referencia `messages` por chave estrangeira.
--    Autorizado pelo Heitor em 2026-11-06 ("sim pode corrigir").
-- 2. O índice único passa a recusar a segunda; o app trata o 23505 como "já
--    estava" (lib/inbox/resolve-conversation.ts).
--
-- `juntar_conversas_do_numero` (sem uso desde a F14, sem execução pela sessão)
-- move mensagens entre conversas e passaria a esbarrar no índice se as duas
-- tivessem o mesmo id: fica como está, na lista das que saem.

with copias as (
  select id, row_number() over (
    partition by conversation_id, external_id
    order by (media_path is not null) desc, created_at, id
  ) as ordem
  from public.messages
  where external_id is not null
)
delete from public.messages m
using copias c
where m.id = c.id and c.ordem > 1;

create unique index if not exists messages_external_id_unico
  on public.messages (conversation_id, external_id)
  where external_id is not null;

notify pgrst, 'reload schema';
