-- Múltiplos números de WhatsApp por rede.
--
-- Até aqui a rede tinha UM número, e isso não era configuração: estava soldado
-- em `integration_configs.unique (tenant_id, provider)`. Todo o sistema
-- perguntava "qual o WhatsApp desta rede?" em vez de "qual destes", e
-- `getWhatsAppConfig` desempatava com `order by updated_at desc` + `data[0]` —
-- escolha silenciosa que ninguém via porque só havia uma linha.
--
-- **Por que tabela nova e não relaxar a constraint de `integration_configs`.**
-- Lá dentro `meta_ads`, `google_ads` e `meta_messaging` são legitimamente UM por
-- rede, e é essa constraint que os protege — `saveAdsConfig`,
-- `confirmMetaAdsSelection` e `getMetaMessagingConfig` (`.maybeSingle()`)
-- dependem dela implicitamente. Tirá-la desprotegeria os três que estão certos.
-- E o número tem identidade própria (rótulo, padrão, unidade, usuário, estado de
-- pareamento): seriam quatro colunas nulas e sem sentido em 3 de 5 linhas.
--
-- Esta migration NÃO é lida por código nenhum ainda, e NÃO apaga as linhas de
-- `integration_configs`. A cópia é reversível; o delete não, e fica sozinho na
-- última fase, depois de soak.

create table if not exists public.whatsapp_numbers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  provider        text not null check (provider in ('uazapi','official')),

  -- Como a rede reconhece esta linha. Obrigatório: com duas caixas, "WhatsApp"
  -- deixou de ser um nome.
  label           text not null,

  -- Identidade de ROTEAMENTO: é por estes campos que o webhook acha a linha que
  -- recebeu, em vez de recarregar "a config da rede" e cair na linha errada.
  phone_e164      text,
  phone_number_id text,   -- Cloud API: `metadata.phone_number_id`
  waba_id         text,   -- Cloud API: dono do catálogo de templates

  -- Credenciais e o resto do que hoje mora em `integration_configs.config`.
  config          jsonb   not null default '{}',

  is_active       boolean not null default false,
  is_default      boolean not null default false,
  -- Instância criada e paga por nós na uazapi (era `config.managed`). Coluna,
  -- porque `instanciasEmUso()` precisa contar isso num índice.
  managed         boolean not null default false,

  -- Vínculos OPCIONAIS.
  -- `branch_id` é RÓTULO: serve para a tela agrupar e para relatório. Não entra
  -- em RLS, não entra em escopo e não entra na precedência de saída — decisão do
  -- Heitor em 2026-09-25. Conversa continua nascendo com `branch_id` nulo.
  branch_id       uuid references public.branches(id) on delete set null,
  -- Quando preenchido, este usuário fala SEMPRE por esta linha.
  user_id         uuid references public.users(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um padrão por rede, garantido pelo BANCO e não por disciplina do app: é por
-- ele que sai tudo que o sistema inicia (automação, campanha, notificação).
create unique index if not exists uniq_whatsapp_numbers_padrao
  on public.whatsapp_numbers (tenant_id) where is_default;

-- Um usuário fala por no máximo uma linha. Duas reintroduziriam exatamente o
-- desempate silencioso que esta frente existe para matar.
create unique index if not exists uniq_whatsapp_numbers_usuario
  on public.whatsapp_numbers (tenant_id, user_id) where user_id is not null;

-- GLOBAL, não por tenant: o webhook da Cloud API roteia SÓ por este id, antes de
-- saber de que rede é. Duas redes reivindicando o mesmo seria ambíguo aqui — e é
-- impossível na Meta.
create unique index if not exists uniq_whatsapp_numbers_phone_number_id
  on public.whatsapp_numbers (phone_number_id) where phone_number_id is not null;

create index if not exists idx_whatsapp_numbers_tenant
  on public.whatsapp_numbers (tenant_id, is_active);
create index if not exists idx_whatsapp_numbers_provider
  on public.whatsapp_numbers (provider, is_active);

alter table public.whatsapp_numbers enable row level security;

-- Decide por ABRANGÊNCIA, não por nome de cargo: `public.eh_da_rede()` já é
-- "tem tenant, não tem unidade e não é cliente final". A policy de
-- `integration_configs` ainda testa `role = 'NETWORK_ADMIN'`, que o CLAUDE.md
-- §11 proíbe; esta não repete o erro.
--
-- Segunda linha de defesa, como no resto do sistema: o caminho de envio e os
-- webhooks usam `createAdminClient()` e passam por cima da RLS de qualquer jeito.
drop policy if exists "Rede gerencia os números de WhatsApp" on public.whatsapp_numbers;
create policy "Rede gerencia os números de WhatsApp" on public.whatsapp_numbers
  for all using (
    public.eh_da_rede()
    and tenant_id::text = public.jwt_claim('tenant_id')
  );

comment on table public.whatsapp_numbers is
  'Caixas de WhatsApp da rede. Uma linha por número, com provedor próprio. Entidade da REDE: quem administra a rede administra todas. `branch_id` é rótulo, não escopo.';
comment on column public.whatsapp_numbers.is_default is
  'Por onde sai tudo que o SISTEMA inicia. No máximo um por rede (índice único parcial) — o app ainda precisa tratar o caso de nenhum.';
comment on column public.whatsapp_numbers.user_id is
  'Quando preenchido, este usuário envia sempre por esta linha, inclusive respondendo conversa que chegou por outra.';

-- ── Cópia do que já existe ────────────────────────────────────────────────────
-- Idempotente pelo `not exists`: hoje há no máximo uma linha por
-- (tenant, provider), que é justamente o que a constraint antiga garantia.
insert into public.whatsapp_numbers
  (tenant_id, provider, label, phone_e164, phone_number_id, waba_id,
   config, is_active, managed, created_at, updated_at)
select
  ic.tenant_id,
  ic.provider,
  coalesce(
    nullif(ic.config->>'connectedName',  ''),
    nullif(ic.config->>'connectedPhone', ''),
    nullif(ic.config->>'phoneNumberId',  ''),
    case ic.provider when 'uazapi' then 'WhatsApp' else 'WhatsApp Oficial' end),
  nullif(ic.config->>'connectedPhone', ''),
  nullif(ic.config->>'phoneNumberId',  ''),
  nullif(ic.config->>'wabaId',         ''),
  ic.config,
  ic.is_active,
  coalesce((ic.config->>'managed')::boolean, false),
  ic.created_at,
  ic.updated_at
from public.integration_configs ic
where ic.provider in ('uazapi', 'official')
  and not exists (
    select 1 from public.whatsapp_numbers w
    where w.tenant_id = ic.tenant_id and w.provider = ic.provider);

-- ── Eleição do padrão ─────────────────────────────────────────────────────────
-- Reproduz EXATAMENTE o desempate de `getWhatsAppConfig` hoje (`is_active desc,
-- updated_at desc`, primeira linha). Eleger outra faria a rede passar a falar
-- por um número diferente no dia da migração, sem ninguém ter pedido.
with escolhido as (
  select distinct on (tenant_id) id, tenant_id
  from public.whatsapp_numbers
  order by tenant_id, is_active desc, updated_at desc
)
update public.whatsapp_numbers w
set is_default = true
from escolhido e
where w.id = e.id
  and not exists (
    select 1 from public.whatsapp_numbers d
    where d.tenant_id = w.tenant_id and d.is_default);
