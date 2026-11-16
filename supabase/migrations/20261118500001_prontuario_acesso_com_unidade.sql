-- A32 da 18ª simulação (2026-11-16): o "Abriu o prontuário" leva a unidade.
--
-- O Dr. Henrique abriu o prontuário em Derby, e a Auditoria mostrou a linha
-- sem unidade ("—"), fora do filtro por Derby: `prontuario_acessos` não tinha
-- unidade, e o gatilho `private.auditar` tira a da linha (`branch_id`). Agora
-- o servidor grava a unidade do ENDEREÇO em que foi aberto
-- (`unidadeDoAcessoAoProntuario`, `lib/prontuario/unidade-do-acesso.ts`); no
-- /admin, nula, como antes.
--
-- Sem chave estrangeira, como o `user_id`: o registro sobrevive à unidade.
-- Quem tem unidades continua sem ler a abertura na Auditoria (o registro de
-- quem abriu é de quem tem a rede, 2026-10-27): a leitura a tira dela.

alter table public.prontuario_acessos add column if not exists branch_id uuid;

drop function if exists public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid);

-- Registra um acesso. A cliente tem de ser da rede, a unidade também (a de
-- fora vira nula), e a mesma pessoa relendo a mesma cliente no mesmo ponto
-- (e referência) em 30 min é uma linha só.
create or replace function public.prontuario_registrar_acesso(
  p_tenant uuid, p_cliente uuid, p_usuario uuid, p_nome text, p_ponto text, p_referencia uuid default null,
  p_unidade uuid default null
)
returns void language sql set search_path = '' as $$
  insert into public.prontuario_acessos (tenant_id, client_id, user_id, ator_nome, ponto, referencia, branch_id)
  select p_tenant, p_cliente, p_usuario, coalesce(nullif(p_nome, ''), 'Alguém da equipe'), p_ponto, p_referencia,
         (select b.id from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant)
   where exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant)
     and not exists (
       select 1 from public.prontuario_acessos a
        where a.client_id = p_cliente
          and a.user_id is not distinct from p_usuario
          and a.ponto = p_ponto
          and a.referencia is not distinct from p_referencia
          and a.acessado_em > now() - interval '30 minutes')
$$;

-- Só o servidor.
revoke execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prontuario_registrar_acesso(uuid, uuid, uuid, text, text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
