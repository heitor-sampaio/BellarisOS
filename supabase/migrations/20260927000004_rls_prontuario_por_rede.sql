-- Prontuário e fidelidade passam a conferir a REDE na RLS.
--
-- Achado na varredura de cobertura de 2026-09-27, confirmado no banco e por
-- `e2e/rls-isolamento.spec.ts` (que falhou antes desta migration): as policies
-- de `medical_records`, `medical_record_entries`, `anamnesis_data`,
-- `consent_terms`, `record_photos`, `loyalty_accounts` e `loyalty_transactions`
-- só exigiam `jwt_claim('role') <> 'CLIENT'`. Qualquer funcionário logado de
-- QUALQUER rede lia e escrevia o prontuário e os pontos de todas, direto no
-- PostgREST com a anon key — que está no bundle do navegador. Com uma rede só
-- no banco não havia vítima; seria vazamento no dia da segunda clínica.
--
-- Estas tabelas não têm `tenant_id`: a rede só se descobre pela cadeia até o
-- cliente. Por isso três helpers, em FUNÇÃO e não em subquery na policy:
-- `security definer` não reaplica a RLS de `clients` a cada linha (o que seria
-- recursão e custo), e cada um é uma busca por chave primária.
--
-- Nomes das policies mantidos, para `alter`/`drop` futuros acharem.

-- Policies de várias tabelas já chamam `private.*`; o papel `authenticated`
-- não tinha USAGE no esquema, e só funcionava porque a regra permissiva ao
-- lado bastava. Os helpers novos não podem depender disso. O esquema `private`
-- não é exposto pela API (o PostgREST só publica `public`).
grant usage on schema private to authenticated;

create or replace function private.cliente_da_minha_rede(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.tenant_id::text = public.jwt_claim('tenant_id')
  )
$$;

create or replace function private.prontuario_da_minha_rede(p_medical_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medical_records m
    join public.clients c on c.id = m.client_id
    where m.id = p_medical_record_id
      and c.tenant_id::text = public.jwt_claim('tenant_id')
  )
$$;

create or replace function private.entrada_da_minha_rede(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medical_record_entries e
    join public.medical_records m on m.id = e.medical_record_id
    join public.clients c on c.id = m.client_id
    where e.id = p_entry_id
      and c.tenant_id::text = public.jwt_claim('tenant_id')
  )
$$;

create or replace function private.conta_de_pontos_da_minha_rede(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loyalty_accounts a
    join public.clients c on c.id = a.client_id
    where a.id = p_account_id
      and c.tenant_id::text = public.jwt_claim('tenant_id')
  )
$$;

revoke all on function private.cliente_da_minha_rede(uuid)         from public, anon;
revoke all on function private.prontuario_da_minha_rede(uuid)      from public, anon;
revoke all on function private.entrada_da_minha_rede(uuid)         from public, anon;
revoke all on function private.conta_de_pontos_da_minha_rede(uuid) from public, anon;
grant execute on function private.cliente_da_minha_rede(uuid)         to authenticated;
grant execute on function private.prontuario_da_minha_rede(uuid)      to authenticated;
grant execute on function private.entrada_da_minha_rede(uuid)         to authenticated;
grant execute on function private.conta_de_pontos_da_minha_rede(uuid) to authenticated;

-- ── Prontuário ───────────────────────────────────────────────────────────────
-- USING e WITH CHECK iguais: sem o CHECK, dava para PLANTAR uma linha no
-- prontuário de um cliente de outra rede (o insert não passa pelo USING).

drop policy if exists "Operacional acessa prontuários" on public.medical_records;
create policy "Operacional acessa prontuários" on public.medical_records
  for all
  using      (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id));

drop policy if exists medical_record_entries_operacional on public.medical_record_entries;
create policy medical_record_entries_operacional on public.medical_record_entries
  for all
  using      (public.jwt_claim('role') <> 'CLIENT' and private.prontuario_da_minha_rede(medical_record_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.prontuario_da_minha_rede(medical_record_id));

drop policy if exists consent_terms_operacional on public.consent_terms;
create policy consent_terms_operacional on public.consent_terms
  for all
  using      (public.jwt_claim('role') <> 'CLIENT' and private.prontuario_da_minha_rede(medical_record_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.prontuario_da_minha_rede(medical_record_id));

drop policy if exists anamnesis_data_operacional on public.anamnesis_data;
create policy anamnesis_data_operacional on public.anamnesis_data
  for all
  using      (public.jwt_claim('role') <> 'CLIENT' and private.entrada_da_minha_rede(entry_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.entrada_da_minha_rede(entry_id));

drop policy if exists record_photos_operacional on public.record_photos;
create policy record_photos_operacional on public.record_photos
  for all
  using      (public.jwt_claim('role') <> 'CLIENT' and private.entrada_da_minha_rede(entry_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.entrada_da_minha_rede(entry_id));

-- ── Fidelidade ───────────────────────────────────────────────────────────────
-- O cliente final continua vendo a PRÓPRIA conta e os próprios pontos; o que
-- muda é o lado da equipe, que passa a ver só a própria rede.

drop policy if exists loyalty_accounts_select on public.loyalty_accounts;
create policy loyalty_accounts_select on public.loyalty_accounts
  for select
  using (
    (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id))
    or (public.jwt_claim('role') = 'CLIENT' and client_id::text = public.jwt_claim('client_id'))
  );

drop policy if exists loyalty_accounts_insert on public.loyalty_accounts;
create policy loyalty_accounts_insert on public.loyalty_accounts
  for insert
  with check (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id));

drop policy if exists loyalty_accounts_update on public.loyalty_accounts;
create policy loyalty_accounts_update on public.loyalty_accounts
  for update
  using      (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id))
  with check (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id));

drop policy if exists loyalty_accounts_delete on public.loyalty_accounts;
create policy loyalty_accounts_delete on public.loyalty_accounts
  for delete
  using (public.jwt_claim('role') <> 'CLIENT' and private.cliente_da_minha_rede(client_id));

drop policy if exists loyalty_transactions_operacional on public.loyalty_transactions;
create policy loyalty_transactions_operacional on public.loyalty_transactions
  for all
  using (
    (public.jwt_claim('role') <> 'CLIENT' and private.conta_de_pontos_da_minha_rede(loyalty_account_id))
    or (public.jwt_claim('role') = 'CLIENT' and exists (
      select 1 from public.loyalty_accounts la
      where la.id = loyalty_transactions.loyalty_account_id
        and la.client_id::text = public.jwt_claim('client_id')))
  )
  -- Escrever pontos é coisa da equipe; o cliente só lê os seus.
  with check (public.jwt_claim('role') <> 'CLIENT' and private.conta_de_pontos_da_minha_rede(loyalty_account_id));

-- ── RPCs que aceitavam qualquer um ───────────────────────────────────────────
-- SECURITY DEFINER, executáveis por `anon` (sem login) e recebendo a rede do
-- CHAMADOR: bastava o id de uma rede para ler as tags de leads dela e a contagem
-- de eventos; e `mark_notification_read` marcava notificação de qualquer cliente
-- sem conferir o dono. Os três chamadores (`actions/inbox.ts`,
-- `actions/eventos.ts`, `actions/notifications.ts`) usam o cliente de serviço,
-- depois de conferir a sessão no app.

revoke execute on function public.lead_tags_da_rede(uuid)              from public, anon, authenticated;
revoke execute on function public.eventos_resumo_do_catalogo(uuid)     from public, anon, authenticated;
revoke execute on function public.mark_notification_read(uuid)         from public, anon, authenticated;
grant  execute on function public.lead_tags_da_rede(uuid)              to service_role;
grant  execute on function public.eventos_resumo_do_catalogo(uuid)     to service_role;
grant  execute on function public.mark_notification_read(uuid)         to service_role;

notify pgrst, 'reload schema';
