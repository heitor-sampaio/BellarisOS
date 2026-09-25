-- O catálogo de templates é de uma WABA, não da rede.
--
-- Com um número oficial por rede, "os templates da rede" e "os templates da
-- WABA" eram a mesma coisa. Com dois números em contas de negócio diferentes,
-- deixam de ser: oferecer na conversa um template que não existe na WABA que
-- vai enviar dá 404 na Meta, no clique, sem explicação nenhuma.
--
-- **Por WABA e não por número**: dois números podem compartilhar a mesma conta
-- de negócio, e escopar por número duplicaria o catálogo aqui e faria submeter
-- o mesmo nome duas vezes à Meta — que recusa por colisão. A WABA é a unidade
-- real de propriedade do template.

alter table public.message_templates
  add column if not exists waba_id text;

comment on column public.message_templates.waba_id is
  'A WhatsApp Business Account dona deste template. Nulo = catálogo de antes dos múltiplos números, que pertence à única WABA que a rede tinha.';

-- ── Backfill ANTES de trocar a constraint ────────────────────────────────────
-- Com `waba_id` nulo, `unique (tenant_id, waba_id, name, language)` não
-- restringe NADA (NULL nunca é igual a NULL) e a garantia de nome único se
-- perderia em silêncio — dois templates com o mesmo nome passariam a conviver,
-- e a Meta recusaria a submissão do segundo sem que ninguém entendesse por quê.
update public.message_templates t
set waba_id = w.waba_id
from public.whatsapp_numbers w
where t.waba_id is null
  and w.tenant_id = t.tenant_id
  and w.provider  = 'official'
  and w.waba_id is not null;

alter table public.message_templates
  drop constraint if exists message_templates_nome_unico;

-- O nome segue único DENTRO de um idioma — agora dentro de uma WABA também.
create unique index if not exists uniq_message_templates_waba
  on public.message_templates (tenant_id, waba_id, name, language);

create index if not exists idx_message_templates_por_waba
  on public.message_templates (tenant_id, waba_id)
  where waba_id is not null;
