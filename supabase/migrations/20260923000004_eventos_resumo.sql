-- Resumo do catálogo para o painel de conferência (Fase 6).
--
-- A conta é feita no BANCO, nunca em JavaScript. Somar em JS o resultado de um
-- `select` significa somar no máximo 1000 linhas — o teto do PostgREST — e
-- subcontar em silêncio quando a corrente crescer. É a mesma regra dos
-- indicadores (CLAUDE.md §13.1), e aqui ela pesa ainda mais: o número serve
-- para decidir se um gatilho de automação funciona, e um "0" errado manda
-- alguém caçar um defeito que não existe.
--
-- Devolve só o que a corrente TEM. Quem cruza com o catálogo inteiro — e
-- portanto mostra o evento que nunca ocorreu — é a aplicação, porque o catálogo
-- mora em `packages/types/src/eventos.ts` e não no banco, de propósito.

create or replace function public.eventos_resumo_do_catalogo(p_tenant_id uuid)
returns table (nome text, vezes bigint, ultimo_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.nome, count(*) as vezes, max(e.ocorrido_em) as ultimo_em
  from public.domain_events e
  where e.tenant_id = p_tenant_id
  group by e.nome
$$;

comment on function public.eventos_resumo_do_catalogo(uuid) is
  'Quantas vezes cada evento ocorreu nesta rede e quando foi o último. Cruzado com o catálogo pela aplicação.';

-- O painel filtra por nome e por entidade dentro de uma rede; o índice de
-- `(tenant_id, nome, ocorrido_em desc)` já cobre o primeiro caso e a listagem
-- geral. Falta o recorte por entidade sem id, que a linha do tempo de um
-- registro não atende (aquele índice exige `entidade_id`).
create index if not exists domain_events_tenant_entidade_idx
  on public.domain_events (tenant_id, entidade, ocorrido_em desc);
