-- Sem plano, sem retrato (2026-10-06): o retrato dos recursos
-- (tenant_subscriptions.recursos) só existe junto de um plano. Quando o
-- plan_id vira NULL — o admin tira o plano, ou o plano é apagado e a FK
-- (on delete set null) o zera —, o retrato vai junto: sem plano = tudo
-- liberado, como em lib/planos/recursos.ts.
create or replace function private.retrato_sem_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is null then new.recursos := null; end if;
  return new;
end $$;

drop trigger if exists trg_retrato_sem_plano on public.tenant_subscriptions;
create trigger trg_retrato_sem_plano
  before insert or update of plan_id, recursos on public.tenant_subscriptions
  for each row execute function private.retrato_sem_plano();
