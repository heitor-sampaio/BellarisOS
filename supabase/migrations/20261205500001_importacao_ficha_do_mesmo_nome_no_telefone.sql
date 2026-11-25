-- D4 da 29ª simulação (2026-11-25): sem CPF, a linha da importação acha quem já
-- existe pela ficha SEM CPF do mesmo telefone (docs/regras/crm-inbox.md, "Quem
-- já existe só tem o VAZIO completado"). Com duas fichas sem CPF no telefone, a
-- linha achava a MAIS ANTIGA: a da Filomena completava a ficha da Edna, embora a
-- ficha da própria Filomena existisse. Entre as fichas sem CPF do telefone, vale
-- a de MESMO NOME (sem acento, sem caixa, sem espaço a mais — a régua do
-- `nomeDiferente` da prévia); sem ela, a mais antiga, como antes. Decisão do
-- Claude, 25/11, pelo princípio 3 (o que a tela mostra é o que vale na conta).
-- O "Completar a ficha de X" da prévia (cli-07, A14) não muda.
--
-- 1) a prévia: `importacao_cruzamento` recebe o nome da linha (troca no corpo
--    VIVO, com a conferência da contagem).
-- 2) a gravação: `cliente_por_telefone` ganha `p_nome` (opcional; quem não o
--    passa — o cadastro rápido, o Copilot — segue com a mais antiga). A
--    assinatura muda: a velha sai, para o PostgREST não ter duas a escolher.
--    O corpo é o vivo, com a ordem nova.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar_no_corpo(
  'public.importacao_cruzamento(uuid,text,jsonb)'::regprocedure,
  array[
    $t$nullif(lower(x.email), '') as email$t$,
    $t$x(numero integer, cpf text, fone text, fones text[], email text)$t$,
    $t$       order by c.created_at
       limit 1)$t$
  ],
  array[
    $t$nullif(lower(x.email), '') as email, nullif(btrim(x.nome), '') as nome_da_linha$t$,
    $t$x(numero integer, cpf text, fone text, fones text[], email text, nome text)$t$,
    $t$       order by coalesce(l.nome_da_linha is not null
                and btrim(regexp_replace(private.sem_acento(c.name), '\s+', ' ', 'g'))
                  = btrim(regexp_replace(private.sem_acento(l.nome_da_linha), '\s+', ' ', 'g')), false) desc, c.created_at
       limit 1)$t$
  ],
  array[1, 1, 1]
);

-- O create or replace mantém dono e grants (service_role só, como antes).

drop function if exists public.cliente_por_telefone(uuid, text, boolean);

create function public.cliente_por_telefone(p_tenant uuid, p_digitos text, p_sem_cpf boolean default false, p_nome text default null)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select c.id
  from clients c
  where c.tenant_id = p_tenant
    and length(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g')) >= 10
    and private.telefone_casa(c.phone, regexp_replace(p_digitos, '\D', '', 'g'))
    and (not p_sem_cpf or c.document is null)
  order by coalesce(nullif(btrim(p_nome), '') is not null
              and btrim(regexp_replace(private.sem_acento(c.name), '\s+', ' ', 'g'))
                = btrim(regexp_replace(private.sem_acento(p_nome), '\s+', ' ', 'g')), false) desc, c.created_at
  limit 1
$function$;

revoke execute on function public.cliente_por_telefone(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.cliente_por_telefone(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';
