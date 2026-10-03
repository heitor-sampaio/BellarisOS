-- treatment_plans: a política comparava `auth.jwt() ->> 'tenant_id'` — o topo
-- do JWT, onde a claim NÃO mora (ela está em app_metadata; CLAUDE.md §4). A
-- comparação nunca casava e a política negava tudo: inofensivo para o app (que
-- lê pelo service role), mas o Realtime de `treatment_plans` nunca entregou
-- nada a ninguém.
--
-- Passa a ser a mesma regra das sessões do plano: equipe (não cliente final)
-- que alcança a unidade do plano, com USING e WITH CHECK.

drop policy if exists "Operacional acessa planos da propria filial" on public.treatment_plans;

create policy treatment_plans_operacional on public.treatment_plans
  for all
  using (public.jwt_claim('role') <> 'CLIENT' and private.can_access_branch(branch_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.can_access_branch(branch_id));

notify pgrst, 'reload schema';
