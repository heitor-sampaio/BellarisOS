-- A rede nova nasce SEM tag nenhuma (o Heitor, 2026-11-16: "A rede nova nasce
-- com 8 tags […]; tiro e deixo o catálogo começar vazio?" — "Sim").
--
-- Tag é filtro personalizado da rede (CLAUDE.md §1, "Tags"): ela cria com o
-- nome que quiser. Desde 2026-10-13 (`20261013000006_tags_da_rede`) toda rede
-- nova ganhava VIP, Indicação, Retorno, Alergias, Gestante, Idoso, Plano e
-- Desconto (`trg_rede_ganha_tags` → `private.tags_padrao()`), e as redes que
-- já existiam também — tags que ninguém da rede criou, em todo cadastro e
-- filtro.
--
-- 1. Sai a semente: o gatilho e as duas funções.
-- 2. Nas redes que já existem, saem do catálogo as tags com um desses oito
--    nomes que NINGUÉM usa. "Usar" é qualquer referência ao nome, sem caixa:
--    as listas `tags` de clients, contacts, leads e conversations (a semente
--    da conversa), e o nome como texto em qualquer ponto do fluxo de uma
--    automação (rascunho e versões: o filtro e a ação "Adicionar tag"), do
--    público e do gatilho de uma campanha e da configuração de uma
--    importação. A que está em uso FICA, arquivada ou não: é da rede agora.
--    Destrutiva por decisão do dono ("Aplica e anota").
--
-- O vocabulário continua crescendo pelo gatilho `trg_registrar_tags` (a tag
-- que a pessoa grava entra no catálogo) — isso não muda.

drop trigger if exists trg_rede_ganha_tags on public.tenants;
drop function if exists private.trg_rede_ganha_tags();
drop function if exists private.tags_padrao();

do $$
declare
  v_saem integer;
begin
  delete from public.tags
  where id in (
    with padrao(chave) as (
      select lower(x) from unnest(array['VIP', 'Indicação', 'Retorno', 'Alergias', 'Gestante', 'Idoso', 'Plano', 'Desconto']) as x
    ),
    candidatas as (
      select t.id, t.tenant_id, lower(btrim(t.nome)) as chave
      from public.tags t
      where lower(btrim(t.nome)) in (select chave from padrao)
    )
    select c.id
    from candidatas c
    where not exists (select 1 from public.clients r, unnest(r.tags) x
                      where r.tenant_id = c.tenant_id and lower(btrim(x)) = c.chave)
      and not exists (select 1 from public.contacts r, unnest(r.tags) x
                      where r.tenant_id = c.tenant_id and lower(btrim(x)) = c.chave)
      and not exists (select 1 from public.leads r, unnest(r.tags) x
                      where r.tenant_id = c.tenant_id and lower(btrim(x)) = c.chave)
      and not exists (select 1 from public.conversations r, unnest(r.tags) x
                      where r.tenant_id = c.tenant_id and lower(btrim(x)) = c.chave)
      and not exists (select 1 from public.automations a,
                        jsonb_path_query(coalesce(a.grafo, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') v
                      where a.tenant_id = c.tenant_id and lower(btrim(v #>> '{}')) = c.chave)
      and not exists (select 1 from public.automation_versions a,
                        jsonb_path_query(coalesce(a.grafo, '{}'::jsonb), 'strict $.** ? (@.type() == "string")') v
                      where a.tenant_id = c.tenant_id and lower(btrim(v #>> '{}')) = c.chave)
      and not exists (select 1 from public.notification_campaigns a,
                        jsonb_path_query(jsonb_build_array(a.audience_rules, a.trigger_config), 'strict $.** ? (@.type() == "string")') v
                      where a.tenant_id = c.tenant_id and lower(btrim(v #>> '{}')) = c.chave)
      and not exists (select 1 from public.importacoes a,
                        jsonb_path_query(jsonb_build_array(a.oportunidade, a.mapeamento), 'strict $.** ? (@.type() == "string")') v
                      where a.tenant_id = c.tenant_id and lower(btrim(v #>> '{}')) = c.chave)
  );
  get diagnostics v_saem = row_count;
  raise notice '[tags] saíram do catálogo % tags-padrão sem uso', v_saem;
end
$$;

notify pgrst, 'reload schema';
