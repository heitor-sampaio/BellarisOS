-- Importação de clientes: o mesmo telefone sem CPF e com outro nome só junta
-- com a marca da prévia (o Heitor, 25/11, escolheu "Vem desmarcada, a não ser
-- que o nome case").
--
-- Até aqui o servidor seguia só o `nao_completar` que a prévia mandava, e
-- juntava por padrão: se o cruzamento da prévia falhasse, ou não tivesse
-- chegado quando a pessoa clicou em Importar, a linha da filha completava a
-- ficha da mãe pelo telefone. `juntar` guarda as linhas de OUTRO nome que a
-- pessoa marcou para juntar; sem a marca, `gravarCliente`
-- (apps/web/lib/importacao/processar.ts) não junta pelo telefone a linha cujo
-- nome não casa com o da ficha, e ela vira a ficha dela.
--
-- A tabela já é auditada (o gatilho lê todas as colunas) e a sessão não a
-- grava (só o servidor, pelo cliente de serviço): nada de política nova.

alter table public.importacoes
  add column if not exists juntar integer[] not null default '{}';

comment on column public.importacoes.juntar is
  'Clientes: as linhas (número da planilha) de OUTRO nome que a prévia marcou para juntar com a ficha do mesmo telefone sem CPF. Sem a marca, o nome que não casa vira ficha nova (o Heitor, 25/11: "Vem desmarcada, a não ser que o nome case").';

notify pgrst, 'reload schema';
