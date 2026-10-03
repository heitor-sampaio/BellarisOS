-- Corrige 20261003000002, que ABRIU `treatment_plans` à sessão.
--
-- A política antiga nunca casava (comparava o `tenant_id` do topo do JWT) e
-- por isso negava tudo — seguro por acidente. A "correção" a fez casar: todo
-- funcionário que alcança a unidade passou a ler, alterar e apagar planos
-- direto pelo PostgREST (preço, desconto, status, contornando
-- `plano_aplicar_desconto` e as travas das actions) e a receber a linha
-- inteira pelo Realtime — com `professional_notes`, dado clínico, inclusive
-- quem não tem prontuário. Achado pela verificação da fase 0 do suporte.
--
-- O app lê e grava planos SÓ pelo servidor (service role). Então:
--   - `treatment_plans`: RLS ligada e ZERO políticas (a sessão não alcança);
--   - sessões do plano e os procedimentos delas: só LEITURA pela sessão (o
--     modal de sessões assina o Realtime delas; nada clínico ali). Eram
--     `FOR ALL` sem WITH CHECK — a sessão gravava preço de sessão pelo PostgREST.
--   - a unidade do plano é lida por função `security definer`: a política
--     não enxerga mais `treatment_plans` com os direitos da sessão.

drop policy if exists treatment_plans_operacional on public.treatment_plans;

create or replace function private.plano_da_minha_unidade(p_plan_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.treatment_plans tp
    where tp.id = p_plan_id and private.can_access_branch(tp.branch_id))
$$;

drop policy if exists treatment_plan_sessions_operacional on public.treatment_plan_sessions;
create policy treatment_plan_sessions_leitura on public.treatment_plan_sessions
  for select
  using (public.jwt_claim('role') <> 'CLIENT' and private.plano_da_minha_unidade(plan_id));

drop policy if exists treatment_plan_session_procedures_operacional on public.treatment_plan_session_procedures;
create policy treatment_plan_session_procedures_leitura on public.treatment_plan_session_procedures
  for select
  using (public.jwt_claim('role') <> 'CLIENT' and exists (
    select 1 from public.treatment_plan_sessions tps
    where tps.id = treatment_plan_session_procedures.session_id
      and private.plano_da_minha_unidade(tps.plan_id)));

notify pgrst, 'reload schema';
