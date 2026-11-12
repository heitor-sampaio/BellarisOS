-- APLICADA em 12/11/2026, com o Heitor presente (H14). Era: "NÃO APLICADA pela
-- F5 (2026-11-01): drop pede confirmação humana", depois de 20261101000501
-- (que já tirou a execução de todos os papéis e deixou o app sem chamá-la).
--
-- O fim de `senha_da_conta_confere` (J-68, 20261029001204): o login diz
-- "desativado" sempre que a conta está banida, sem conferir a senha.

drop function public.senha_da_conta_confere(text, text);

notify pgrst, 'reload schema';
