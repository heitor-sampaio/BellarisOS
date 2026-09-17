-- O plano de tratamento é uma entidade própria: tem nome e pode existir antes
-- de haver cliente.
--
-- `appointments.client_id` é NOT NULL, então toda avaliação já obrigava a
-- cadastrar cliente antes — com CPF e e-mail, porque o cadastro cria login. E
-- montar um plano exigia o mesmo. Na prática, pedir documento a quem ainda está
-- decidindo, na hora errada.
--
-- Agora a profissional nomeia o plano ("Harmonização — Marina, indicação da
-- Paula") e liga a um cliente quando houver um. A busca acha pelo nome do plano
-- ou pelos dados do cliente, quando ligado.

alter table treatment_plans
  alter column client_id drop not null;

alter table treatment_plans
  add column if not exists name text;

comment on column treatment_plans.name is
  'Nome dado pela profissional. É por ele que o plano é encontrado enquanto não houver cliente.';

comment on column treatment_plans.client_id is
  'Nulo enquanto o plano não tem cliente. Aceitar o plano exige um: é quando vira venda.';

create index if not exists treatment_plans_sem_cliente_idx
  on treatment_plans(branch_id, created_at desc)
  where client_id is null;

-- Vínculo do dinheiro com o plano: é o que permite saber o que ainda está em
-- aberto dele — o número que a recepção vê no check-in, quando a pessoa chega
-- para a primeira sessão.
alter table financial_transactions
  add column if not exists treatment_plan_id uuid references treatment_plans(id) on delete set null;

comment on column financial_transactions.treatment_plan_id is
  'Plano de tratamento que originou o lançamento (venda, entrada, parcelas).';

create index if not exists financial_transactions_plan_idx
  on financial_transactions(treatment_plan_id)
  where treatment_plan_id is not null;

-- Planos antigos ganham um nome legível, para não aparecerem sem identificação
-- na lista nova.
update treatment_plans p
set name = coalesce(
  (select 'Plano de ' || c.name from clients c where c.id = p.client_id),
  'Plano de tratamento'
)
where p.name is null;
