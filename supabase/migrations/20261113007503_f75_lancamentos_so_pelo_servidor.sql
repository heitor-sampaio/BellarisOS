-- F75 (a sobra da F63, C1 do levantamento das regras: "a sessão só lê o que o
-- cargo vê"; CLAUDE.md §4). RESTRITIVA: aplicar DEPOIS do deploy que tirou a
-- última leitura pela sessão (a lista do Financeiro da unidade,
-- app/[slug]/financeiro/page.tsx, passou ao cliente de serviço).
--
-- A política "Operacional acessa financeiro da filial" é ALL para todo membro
-- da unidade (`role <> 'CLIENT'` e a unidade), SEM o módulo e sem WITH CHECK:
-- pela chave pública, a profissional sem o Financeiro lia o caixa da unidade
-- inteira, e QUALQUER membro gravava um recebimento pago falso
-- (e2e/rls-f75-financeiro-pela-sessao.spec.ts, visto falhando antes).
--
-- Quem lê e grava lançamento é o servidor, depois da trava da action e do
-- alcance — como as comissões (F63). A sessão não lê nem grava nada: uma
-- política RESTRITIVA, sem apagar a antiga (ela fica sem efeito; tirá-la é
-- limpeza, anotada para o Heitor). A tabela não está na publicação do
-- Realtime (as telas assinam `financeiro_sinais`).

create policy financeiro_so_pelo_servidor on public.financial_transactions
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
