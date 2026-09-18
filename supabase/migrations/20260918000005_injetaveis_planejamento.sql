-- O mapa de injetáveis vira um PLANEJAMENTO, como o plano de tratamento.
--
-- Era um por cliente (`unique (client_id)`), o que obrigava a ter o cliente
-- cadastrado antes de desenhar qualquer coisa — e dava um único mapa para a
-- vida inteira dele. Agora:
--
--   • `name`      — o planejamento tem nome próprio, e é por ele que se acha
--                   enquanto não há cliente;
--   • `client_id` — opcional: dá para planejar avulso (avaliação por foto,
--                   orçamento no balcão) e ligar ao cliente depois;
--   • sem unique  — vários planejamentos por cliente ao longo do tempo, que é
--                   como o plano de tratamento já funciona.
--
-- `tenant_id` passa a existir na tabela porque, sem cliente, não havia por onde
-- descobrir de qual rede o planejamento é.

alter table public.injectable_maps
  add column if not exists name      text,
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

alter table public.injectable_maps
  alter column client_id drop not null;

-- Os mapas que já existem são do tenant do cliente deles.
update public.injectable_maps m
   set tenant_id = c.tenant_id
  from public.clients c
 where c.id = m.client_id
   and m.tenant_id is null;

alter table public.injectable_maps
  alter column tenant_id set not null;

-- Um cliente passa a poder ter mais de um planejamento.
alter table public.injectable_maps
  drop constraint if exists injectable_maps_client_id_key;

create index if not exists injectable_maps_tenant_idx
  on public.injectable_maps (tenant_id, updated_at desc);

create index if not exists injectable_maps_client_idx
  on public.injectable_maps (client_id);

-- RLS: a leitura era por `client_id`; com planejamento avulso ela passa a ser
-- por tenant, no mesmo padrão de `role_permissions` e das demais tabelas.
alter table public.injectable_maps enable row level security;

drop policy if exists injectable_maps_select on public.injectable_maps;
create policy injectable_maps_select on public.injectable_maps
  for select using (tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists injectable_maps_insert on public.injectable_maps;
create policy injectable_maps_insert on public.injectable_maps
  for insert with check (tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists injectable_maps_update on public.injectable_maps;
create policy injectable_maps_update on public.injectable_maps
  for update using (tenant_id = (jwt_claim('tenant_id'))::uuid);

drop policy if exists injectable_maps_delete on public.injectable_maps;
create policy injectable_maps_delete on public.injectable_maps
  for delete using (tenant_id = (jwt_claim('tenant_id'))::uuid);

-- A aplicação é documento de prontuário e continua exigindo cliente; o vínculo
-- com o planejamento que a originou vira rastro (nulo nas que já existem).
alter table public.injectable_applications
  add column if not exists map_id uuid references public.injectable_maps(id) on delete set null;
