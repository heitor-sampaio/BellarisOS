-- A13 da 12ª simulação (2026-11-11): o registro no conselho da profissional.
--
-- A Helena da Margarida não tinha como pôr o CRM/COREN no termo. Princípio 1:
-- um campo OPCIONAL no cadastro da pessoa da equipe ("Registro no conselho",
-- Equipe → Adicionar membro e o lápis), gravado só pelo servidor
-- (`createTeamMember`/`updateTeamMember`), e a variável `profissional.registro`
-- dos documentos (`lib/documentos/variaveis.ts`), que sai vazia sem ele.
alter table public.users add column if not exists registro_conselho text;

comment on column public.users.registro_conselho is
  'Registro no conselho (CRM, COREN…) da pessoa da equipe, opcional — a variável profissional.registro dos documentos (A13 da 12ª).';

notify pgrst, 'reload schema';
