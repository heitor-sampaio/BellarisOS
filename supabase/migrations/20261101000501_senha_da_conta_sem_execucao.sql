-- F5 da 5ª simulação (2026-11-01, o Heitor: "concordo"): o login diz
-- "Seu acesso foi desativado pela clínica" SEMPRE que o Auth responde
-- `user_banned`, sem conferir a senha. A conferência (J-68,
-- 20261029001204) era um oráculo de senha sem limite: o limite do Auth não
-- conta a conta banida, e a função respondia a cada tentativa.
--
-- O app parou de chamá-la; aqui ninguém mais a executa, nem o servidor. Tirar
-- a função é destrutivo (pede confirmação humana no Supabase) e fica para
-- 20261101000502, à parte.

revoke execute on function public.senha_da_conta_confere(text, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
