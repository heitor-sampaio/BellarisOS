-- A conversa passa a saber POR QUAL CAIXA ela aconteceu.
--
-- Sem isto, duas caixas de WhatsApp na mesma rede colidem: o mesmo telefone
-- falando com a Recepção e com o Comercial seria UMA conversa, porque a chave de
-- dedup era `(tenant_id, channel, contact_external_id)` — a caixa não entrava.
--
-- `messages` ganha a mesma coluna por um motivo diferente e igualmente
-- necessário: o usuário com número próprio responde SEMPRE pelo número dele,
-- inclusive numa conversa que chegou por outro (decisão do Heitor em
-- 2026-09-25). Sem a coluna na mensagem, o histórico afirmaria que tudo saiu
-- pela caixa da conversa — o que passa a ser mentira exatamente no caso que
-- mais importa auditar.
--
-- Esta migration ainda NÃO é lida por código nenhum. O que ela faz de
-- irreversível é o drop dos dois índices antigos, no fim: depois que existirem
-- duplicatas legítimas por caixa, recriá-los exige fundir conversas à mão.

alter table public.conversations
  add column if not exists whatsapp_number_id uuid
  references public.whatsapp_numbers(id) on delete set null;

alter table public.messages
  add column if not exists whatsapp_number_id uuid
  references public.whatsapp_numbers(id) on delete set null;

create index if not exists idx_conversations_numero
  on public.conversations (whatsapp_number_id) where whatsapp_number_id is not null;
create index if not exists idx_messages_numero
  on public.messages (whatsapp_number_id) where whatsapp_number_id is not null;

comment on column public.conversations.whatsapp_number_id is
  'A caixa por onde esta conversa acontece. Nulo nos canais sem caixa própria (Instagram, Messenger, manual) — e é por isso que o dedup usa DOIS índices parciais em vez de um total.';
comment on column public.messages.whatsapp_number_id is
  'A caixa por onde esta mensagem saiu ou entrou. Pode diferir da conversa: o usuário com número próprio responde sempre pelo dele.';

-- ── Backfill, ANTES dos índices ───────────────────────────────────────────────
-- Toda conversa de WhatsApp que existe hoje aconteceu na única caixa que a rede
-- tinha. Sem este passo, o ramo `IS NOT NULL` dos índices novos não cobriria o
-- histórico e o ramo `IS NULL` cobriria — o que funciona, mas faz a primeira
-- caixa nova duplicar todo mundo.

-- (1) O que a própria conversa já sabe.
--
-- Na prática isto não casa nada no banco de dev: `conversations.provider` só é
-- gravado num envio BEM-SUCEDIDO (`lib/inbox/enviar.ts`), e as 58 conversas de
-- WhatsApp de hoje estão todas com ele nulo. Fica porque é a fonte mais
-- específica quando existe, e porque em outra rede pode existir.
update public.conversations c
set whatsapp_number_id = w.id
from public.whatsapp_numbers w
where c.channel = 'whatsapp'
  and c.whatsapp_number_id is null
  and c.provider is not null
  and w.tenant_id = c.tenant_id
  and w.provider  = c.provider;

-- (2) O resto vai para o padrão da rede — que a migration anterior elegeu
--     reproduzindo o desempate que o sistema já usava.
update public.conversations c
set whatsapp_number_id = w.id
from public.whatsapp_numbers w
where c.channel = 'whatsapp'
  and c.whatsapp_number_id is null
  and w.tenant_id = c.tenant_id
  and w.is_default;

-- A mensagem herda a caixa da conversa: até agora não havia por onde divergir.
update public.messages m
set whatsapp_number_id = c.whatsapp_number_id
from public.conversations c
where m.conversation_id = c.id
  and m.whatsapp_number_id is null
  and c.whatsapp_number_id is not null;

-- ── Dedup ─────────────────────────────────────────────────────────────────────
-- A armadilha: num índice único direto, NULL nunca colide. Se a chave virasse
-- `(tenant, channel, whatsapp_number_id, contact_external_id)` num índice só,
-- Instagram, Messenger e manual ficariam SEM DEDUP NENHUM, em silêncio.
--
-- Por isso dois índices parciais em vez de um: o ramo `IS NULL` preserva
-- exatamente a garantia de hoje para os canais sem caixa, e o ramo
-- `IS NOT NULL` acrescenta a garantia por caixa.
--
-- E os novos vêm ANTES do drop dos antigos: dropar primeiro abriria uma janela
-- sem dedup nenhum se um `create` falhasse por duplicata real.

create unique index if not exists uniq_conversations_numero_external
  on public.conversations (tenant_id, channel, whatsapp_number_id, contact_external_id)
  where whatsapp_number_id is not null;

create unique index if not exists uniq_conversations_sem_numero_external
  on public.conversations (tenant_id, channel, contact_external_id)
  where whatsapp_number_id is null;

create unique index if not exists uniq_conversations_numero_phone
  on public.conversations (tenant_id, channel, whatsapp_number_id, contact_phone)
  where contact_phone is not null and whatsapp_number_id is not null;

create unique index if not exists uniq_conversations_sem_numero_phone
  on public.conversations (tenant_id, channel, contact_phone)
  where contact_phone is not null and whatsapp_number_id is null;

-- Só agora, com a sucessão de pé.
drop index if exists public.uniq_conversations_tenant_channel_external;
drop index if exists public.uniq_conversations_tenant_channel_phone;
