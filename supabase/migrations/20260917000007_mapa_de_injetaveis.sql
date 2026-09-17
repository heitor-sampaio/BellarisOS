-- Mapa de injetáveis do CLIENTE, com as aplicações congeladas.
--
-- O mapa era um campo dentro da ficha de UM atendimento: no atendimento
-- seguinte começava do zero, e não havia como comparar com o que foi aplicado
-- da última vez — sendo que dose aplicada é prontuário.
--
-- São duas coisas, de propósito:
--
--   `injectable_maps`         o mapa VIVO, um por cliente. É o que a
--                             profissional abre, ajusta e planeja.
--   `injectable_applications` o que foi REALMENTE aplicado num atendimento.
--                             Cópia congelada, nunca reescrita — planejar em
--                             junho não pode apagar o que foi aplicado em março.
--
-- Os pontos seguem o formato que `lib/anamnesis.ts` já usa (x/y de 0 a 1
-- relativos ao viewBox do rosto, produto, dose, unidade, aplicado, nota).

create table if not exists injectable_maps (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique references clients(id) on delete cascade,
  branch_id   uuid references branches(id) on delete set null,
  view        text not null default 'front',
  points      jsonb not null default '[]'::jsonb,
  updated_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table injectable_maps is
  'Mapa de injetáveis vivo do cliente — o planejamento atual. Um por cliente.';

create table if not exists injectable_applications (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  professional_id uuid references users(id),
  applied_at      timestamptz not null default now(),
  view            text not null default 'front',
  points          jsonb not null,
  totals          jsonb not null default '[]'::jsonb,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table injectable_applications is
  'O que foi aplicado num atendimento: cópia congelada do mapa. Documento de prontuário, não se edita.';

create index if not exists injectable_applications_client_idx
  on injectable_applications(client_id, applied_at desc);

create index if not exists injectable_applications_appointment_idx
  on injectable_applications(appointment_id)
  where appointment_id is not null;

-- RLS: mesma regra do prontuário — equipe com alcance na filial do cliente, e o
-- próprio cliente pelos dados dele.
alter table injectable_maps enable row level security;
alter table injectable_applications enable row level security;

drop policy if exists injectable_maps_all on injectable_maps;
create policy injectable_maps_all on injectable_maps for all
  using (
    exists (
      select 1 from clients c
      where c.id = injectable_maps.client_id
        and (
          (jwt_claim('client_id') is null and private.can_access_branch(c.branch_id))
          or c.id = (jwt_claim('client_id'))::uuid
        )
    )
  );

drop policy if exists injectable_applications_all on injectable_applications;
create policy injectable_applications_all on injectable_applications for all
  using (
    exists (
      select 1 from clients c
      where c.id = injectable_applications.client_id
        and (
          (jwt_claim('client_id') is null and private.can_access_branch(c.branch_id))
          or c.id = (jwt_claim('client_id'))::uuid
        )
    )
  );
