-- A prévia da importação diz o que vai ser FUNDIDO (A15 da 5ª simulação,
-- 2026-11-01: "10 linhas prontas", e a "Renata Quintas" sumiu na ficha da
-- Luana Prado pelo telefone — só o resultado final dizia "1 completado") e
-- deixa desmarcar o "vai completar a ficha de Marlene" (cli-07, revisão do
-- Heitor de 2026-11-02: a filha com o telefone da mãe completava a ficha
-- rápida da mãe).
--
-- 1. `importacao_cruzamento`: numa ida só, quem cada linha ENCONTRA na rede,
--    com a MESMA regra de `lib/importacao/processar.ts`:
--    - clientes: o CPF; sem achar, a ficha SEM CPF do mesmo telefone (a mais
--      antiga, os 8 últimos dígitos, como `cliente_por_telefone`);
--    - contatos: a pessoa do telefone (as formas com e sem o nono dígito, que
--      a tela manda em `fones`); sem telefone, a do e-mail (sem caixa).
-- 2. `importacoes.nao_completar`: as linhas da planilha em que a clínica
--    desmarcou o "vai completar a ficha de X" — ali o telefone não junta, e
--    nasce uma ficha nova (o CPF continua juntando: é a mesma pessoa).

alter table public.importacoes add column if not exists nao_completar integer[] not null default '{}';

comment on column public.importacoes.nao_completar is
  'As linhas da planilha (numero) em que a prévia desmarcou "vai completar a ficha de X" (cli-07): o telefone não junta, nasce ficha nova. O CPF continua juntando.';

create or replace function public.importacao_cruzamento(p_tenant uuid, p_destino text, p_linhas jsonb)
returns table (numero integer, id uuid, nome text, como text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with l as (
    select x.numero, nullif(x.cpf, '') as cpf, nullif(x.fone, '') as fone, coalesce(x.fones, '{}') as fones, nullif(lower(x.email), '') as email
    from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(numero integer, cpf text, fone text, fones text[], email text)
  )
  select l.numero, m.id, m.nome, m.como
  from l
  cross join lateral (
    select * from (
      (select c.id, c.name as nome, 'cpf'::text as como, 1 as ordem
       from clients c
       where p_destino = 'clientes' and l.cpf is not null and c.tenant_id = p_tenant and c.document = l.cpf
       limit 1)
      union all
      (select c.id, c.name, 'telefone', 2
       from clients c
       where p_destino = 'clientes' and l.fone is not null and length(l.fone) >= 10
         and c.tenant_id = p_tenant and c.document is null
         and right(regexp_replace(c.phone, '\D', '', 'g'), 8) = right(l.fone, 8)
       order by c.created_at
       limit 1)
      union all
      (select ct.id, coalesce(ct.name, ct.phone), 'telefone', 3
       from contacts ct
       where p_destino = 'contatos' and l.fone is not null and ct.tenant_id = p_tenant and ct.identifiers && l.fones
       order by ct.created_at
       limit 1)
      union all
      (select ct.id, coalesce(ct.name, ct.email), 'email', 4
       from contacts ct
       where p_destino = 'contatos' and l.fone is null and l.email is not null and ct.tenant_id = p_tenant and lower(ct.email) = l.email
       order by ct.created_at
       limit 1)
    ) achados
    order by ordem
    limit 1
  ) m
$$;

comment on function public.importacao_cruzamento(uuid, text, jsonb) is
  'Quem cada linha da importação encontra na rede (A15/cli-07), com a regra de lib/importacao/processar.ts. Só o servidor.';

revoke execute on function public.importacao_cruzamento(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.importacao_cruzamento(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
