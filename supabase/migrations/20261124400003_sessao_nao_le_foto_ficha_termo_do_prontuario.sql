-- O resto do prontuário também não se lê pela sessão (CLAUDE.md §4, "Módulo
-- com escopo não se lê pela sessão"; §14, "Política de leitura pela sessão em
-- tabela de módulo com escopo").
--
-- A 20261124400002 tirou as políticas de medical_records,
-- medical_record_entries e dos injetáveis, mas deixou três tabelas clínicas
-- com a política "operacional" de 2026-09-27, que só confere a REDE:
--  - record_photos  (as fotos do atendimento),
--  - anamnesis_data (a ficha preenchida no atendimento),
--  - consent_terms  (os termos do prontuário e do plano).
-- Os helpers delas (private.entrada_da_minha_rede, prontuario_da_minha_rede)
-- são security definer: leem o prontuário por cima da RLS. Então qualquer
-- membro da rede, SEM o Prontuário, lia, trocava, apagava (§14: nada clínico
-- se apaga) e plantava esses registros direto no PostgREST com a chave
-- pública. Achado na entrega de 18/11, pela prova
-- e2e/rls-sessao-so-le-prontuario-e-automacoes.spec.ts.
--
-- Nenhum código do app usa essas tabelas pela sessão (só o cliente de
-- serviço), e nenhuma está na publicação do Realtime: fechar não quebra
-- tela, e pode ir antes ou depois do deploy. As restritivas do suporte
-- (suporte_sem_clinico, suporte_sem_escrita_*) ficam.

drop policy if exists record_photos_operacional on public.record_photos;
drop policy if exists anamnesis_data_operacional on public.anamnesis_data;
drop policy if exists consent_terms_operacional on public.consent_terms;

notify pgrst, 'reload schema';
