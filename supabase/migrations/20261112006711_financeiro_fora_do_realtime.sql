-- O lançamento sai do Realtime (F67, a sobra da F63) — DEPOIS do deploy.
--
-- Desde a 20261112006710 as telas assinam `financeiro_sinais`. Enquanto
-- `financial_transactions` estiver na publicação, qualquer membro logado
-- assina a tabela direto pela chave pública e recebe a linha inteira de cada
-- lançamento da unidade (valor, cliente) — também quem o cargo deixa ver só
-- "os meus". Aplicar só com o código novo no ar: o canal que ainda a assina
-- (a versão antiga) falharia inteiro.

do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'financial_transactions') then
    alter publication supabase_realtime drop table public.financial_transactions;
  end if;
end
$$;
