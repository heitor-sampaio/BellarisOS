-- O site do BellarisOS (bellarisos.com, apps/site — 2026-10-17) mostra os
-- preços VERDADEIROS: os dos planos do sistema. `platform_plans` segue sem
-- política nenhuma (só o servidor lê); o site, que só tem a chave pública,
-- lê por esta função, que devolve o que é vitrine e nada mais:
--  - só os planos ATIVOS, na ordem do sistema;
--  - sem o id e sem as datas;
--  - os recursos sem as COTAS (a do Copilot é conta interna).
-- Sem parâmetro: não há rede envolvida, e o catálogo é público por natureza.

create or replace function public.planos_do_site()
returns table (nome text, descricao text, valor_centavos integer, ordem integer, recursos jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.nome, p.descricao, p.valor_centavos, p.ordem, p.recursos - 'cotas'
  from public.platform_plans p
  where p.ativo
  order by p.ordem, p.nome
$$;

revoke execute on function public.planos_do_site() from public;
grant execute on function public.planos_do_site() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
