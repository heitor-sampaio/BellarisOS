-- A importação do HISTÓRICO de uma caixa do WhatsApp Web (uazapi), 2026-10-13.
--
-- Ao parear, o WhatsApp manda à instância um recorte recente das conversas, e
-- a uazapi o guarda. O BellarisOS o busca e grava como importado
-- (lib/whatsapp/historico-uazapi.ts). Cada pedido é uma linha: é ela que
-- impede duas passagens ao mesmo tempo na mesma caixa (só uma em aberto, pelo
-- índice) e que a tela lê para dizer como está.
--
-- RLS ligada e ZERO políticas permissivas: só o servidor lê e escreve.

create table if not exists public.whatsapp_historicos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  whatsapp_number_id uuid not null references public.whatsapp_numbers(id) on delete cascade,
  status             text not null default 'pendente'
                     check (status in ('pendente', 'importando', 'concluida', 'falhou')),
  conversas          integer not null default 0,
  mensagens          integer not null default 0,
  erro               text,
  criada_em          timestamptz not null default now(),
  iniciada_em        timestamptz,
  concluida_em       timestamptz
);

-- Uma importação em aberto por caixa: a segunda conexão (ou o segundo clique)
-- bate aqui em vez de rodar junto e gravar duas vezes.
create unique index if not exists uniq_whatsapp_historicos_em_aberto
  on public.whatsapp_historicos (whatsapp_number_id)
  where status in ('pendente', 'importando');

create index if not exists idx_whatsapp_historicos_caixa
  on public.whatsapp_historicos (whatsapp_number_id, criada_em desc);

alter table public.whatsapp_historicos enable row level security;

-- A sessão de suporte não grava pelo PostgREST (o laço de 20261008000010,
-- repetido para a tabela nova).
create policy suporte_sem_escrita_ins on public.whatsapp_historicos as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.whatsapp_historicos as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                   else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.whatsapp_historicos as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
              else not private.suporte_sem_escrita() end);

notify pgrst, 'reload schema';
